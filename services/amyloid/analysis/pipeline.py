"""Bounded, reference-free analysis of uploaded structures; no model generation."""

from __future__ import annotations
import csv
import hashlib
import importlib.metadata
import itertools
import json
import math
import os
from pathlib import Path
import platform
import shutil
import string
import subprocess
import sys
import time
import zipfile
import hdbscan
import numpy as np
import pandas as pd
from amyloid_cross_check.common import load_assembly, run_structural_pipeline
from amyloid_cross_check.scoring_calibration.gates_cli import assess_manifest
from .alignment import parse, to_distance
from .selection import features, center, greedy

ROOT = Path(__file__).resolve().parents[1]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def clean(value):
    if isinstance(value, dict):
        return {str(k): clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (float, np.floating)):
        return float(value) if math.isfinite(value) else None
    if isinstance(value, (np.bool_,)):
        return bool(value)
    return value


def save(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(clean(value), indent=2, allow_nan=False) + "\n")
    temporary.replace(path)


def portable(value):
    if isinstance(value, dict):
        return {k: portable(v) for k, v in value.items() if k != "provenance"}
    if isinstance(value, list):
        return [portable(v) for v in value]
    if isinstance(value, str) and value.startswith("/"):
        return Path(value).name
    return value


def normalize_for_alignment(source, dest):
    assembly = load_assembly(source, model_index=0)
    if len(assembly.atoms) > int(os.environ.get("AMYLOID_MAX_ATOMS", "50000")):
        raise ValueError("Structure exceeds the configured atom limit.")
    if len(assembly.chains) > 62:
        raise ValueError(
            "At most 62 polymer chains are supported for alignment export."
        )
    lines, mapping, serial = [], {}, 0
    for index, (chain_id, chain) in enumerate(assembly.chains.items()):
        output_chain = (
            string.ascii_uppercase + string.ascii_lowercase + string.digits
        )[index]
        mapping[output_chain] = chain_id
        if len(chain.residues) > 9999:
            raise ValueError("Chain exceeds the alignment residue limit.")
        for number, residue in enumerate(chain.residues, 1):
            atom = residue.atom("CA")
            if atom is None:
                continue
            serial += 1
            x, y, z = atom.coord
            if not all(math.isfinite(v) and -999 <= v <= 9999 for v in atom.coord):
                raise ValueError(
                    "Coordinates cannot be represented by the alignment PDB format."
                )
            lines.append(
                f"ATOM  {serial:5d}  CA  {residue.normalized_name:3s} {output_chain}{number:4d}    {x:8.3f}{y:8.3f}{z:8.3f}  1.00  0.00           C  "
            )
        lines.append("TER")
    if serial < 3:
        raise ValueError("At least three C-alpha atoms are required.")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text("\n".join(lines + ["END", ""]))
    signature = sorted(chain.sequence for chain in assembly.chains.values())
    return {
        "ca_count": serial,
        "chain_map": mapping,
        "chain_lengths": [len(s) for s in signature],
        "construct_sha256": hashlib.sha256(json.dumps(signature).encode()).hexdigest(),
        "alignment_sha256": sha(dest),
        "model_index": 0,
        "models_in_source": assembly.parse_report.total_models,
        "alignment_policy": "package-normalized first model; C-alpha only; PDB coordinates at 0.001 A; sequential chain/residue IDs",
    }


def row_from_report(report, entry):
    f = report["component_features"]
    gates = report["positive_reference_gates"]
    confidence = entry.get("confidence", {})
    return dict(
        prediction_id=entry["id"],
        method=confidence.get("method", "unspecified"),
        qc_status=report["quality_gate"]["qc_status"],
        G_geometry=f["geometry"].get("G_geometry"),
        D_sasa=f["packing"].get("D_sasa"),
        N_soluble_core=report["soluble_intrachain_core"].get("N_soluble_core"),
        dG_total_per_residue=f["energy"].get("dG_total_per_residue"),
        dG_interchain_per_residue=f["energy"].get("dG_interchain_per_residue"),
        packing_gate_eligible=gates["packing_eligible"],
        energy_gate_eligible=gates["energy_eligible"],
        iptm=confidence.get("iptm"),
        mean_plddt=confidence.get("mean_plddt"),
    )


def matrix_for(entries, work, executable, progress):
    n = len(entries)
    similarity = np.full((n, n), np.nan)
    pairs = list(
        itertools.chain(((i, i) for i in range(n)), itertools.combinations(range(n), 2))
    )
    for index, (i, j) in enumerate(pairs):
        progress("alignment", index, len(pairs))
        directions = []
        for a, b in ([(i, j)] if i == j else [(i, j), (j, i)]):
            command = [
                str(executable),
                str(work / "alignment" / f"{entries[a]['id']}.pdb"),
                str(work / "alignment" / f"{entries[b]['id']}.pdb"),
            ]
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=int(os.environ.get("AMYLOID_PAIR_TIMEOUT", "120")),
                check=True,
            )
            parsed = parse(result.stdout)
            if (
                parsed["length1"] != entries[a]["alignment"]["ca_count"]
                or parsed["length2"] != entries[b]["alignment"]["ca_count"]
            ):
                raise ValueError(
                    "MM-align lengths disagree with the prepared coordinates."
                )
            directions.append(parsed)
        scores = [min(d["tm1"], d["tm2"]) for d in directions]
        if i == j and scores[0] < 1 - 1e-4:
            raise ValueError("MM-align self-alignment failed.")
        similarity[i, j] = similarity[j, i] = (
            1.0 if i == j else sum(scores) / len(scores)
        )
        save(
            work / "pairs" / f"{entries[i]['id']}-{entries[j]['id']}.json",
            {
                "ids": [entries[i]["id"], entries[j]["id"]],
                "directions": directions,
                "similarity": float(similarity[i, j]),
            },
        )
    return to_distance(similarity)


def group_analysis(entries, reports, matrix, settings):
    n = len(entries)
    labels = np.full(n, -1, dtype=int)
    ready = n >= max(settings["min_cluster_size"], settings["min_samples"] + 1)
    if ready:
        labels = hdbscan.HDBSCAN(
            metric="precomputed",
            algorithm="generic",
            core_dist_n_jobs=1,
            gen_min_span_tree=True,
            min_cluster_size=settings["min_cluster_size"],
            min_samples=settings["min_samples"],
            cluster_selection_method="eom",
            cluster_selection_epsilon=0.0,
        ).fit_predict(matrix.copy())
    frame = pd.DataFrame([row_from_report(reports[e["id"]], e) for e in entries])
    for col in [
        "G_geometry",
        "D_sasa",
        "N_soluble_core",
        "dG_total_per_residue",
        "dG_interchain_per_residue",
        "iptm",
        "mean_plddt",
    ]:
        frame[col] = pd.to_numeric(frame[col], errors="coerce")
    frame = features(frame)
    frame["cluster"] = labels
    frame = center(frame, matrix)
    # A complete scientific report remains necessary; unknown confidence stays NaN.
    eligible = frame[frame.support_eligible & frame.cluster.ge(0)]
    ordered = eligible.sort_values(
        ["tier", "R", "prediction_id"], ascending=[True, False, True]
    )
    chosen = greedy(ordered, matrix, 0.20, limit=settings["max_candidates"])
    selected = frame.loc[chosen, "prediction_id"].tolist()
    members = []
    for index, row in frame.iterrows():
        reasons = []
        if row.qc_status != "pass":
            reasons.append("quality_gate_failed")
        if row.evidence_components != 4:
            reasons.append("incomplete_structural_evidence")
        if not math.isfinite(row.amyloid_score) or row.amyloid_score < 50:
            reasons.append("below_pool_relative_evidence_floor")
        if not math.isfinite(row.confidence_score) or not math.isfinite(
            row.confidence_score_method
        ):
            reasons.append("confidence_not_provided")
        if not ready:
            reasons.append("pool_too_small_for_clustering_settings")
        elif row.cluster < 0:
            reasons.append("hdbscan_noise")
        members.append(
            clean(
                {
                    "id": row.prediction_id,
                    "cluster": int(row.cluster) if ready else None,
                    "evidence_score": row.amyloid_score if n > 1 else None,
                    "rank_score": row.R if n > 1 else None,
                    "centrality": row.centrality,
                    "selected_rank": (
                        selected.index(row.prediction_id) + 1
                        if row.prediction_id in selected
                        else None
                    ),
                    "eligibility_reasons": reasons,
                }
            )
        )
    representatives = []
    for label in sorted(set(labels) - {-1}):
        indices = np.flatnonzero(labels == label)
        medoid = indices[int(np.argmin(matrix[np.ix_(indices, indices)].sum(axis=1)))]
        representatives.append(
            {
                "cluster": int(label),
                "id": entries[medoid]["id"],
                "size": int(len(indices)),
            }
        )
    return {
        "clustering_status": "complete" if ready else "insufficient_pool_size",
        "members": members,
        "representatives": representatives,
        "shortlist": selected,
        "scientific_scope": "Exploratory uploaded pool; not a calibrated probability or reproduction of archived partitions.",
    }, frame


def _run(work):
    work = Path(work).resolve()
    request = json.loads((work / "request.json").read_text())
    started = time.time()
    entries = request["structures"]
    reports = {}
    results = []
    successful = []

    def progress(stage, done, total):
        save(
            work / "progress.json", {"stage": stage, "completed": done, "total": total}
        )

    for index, entry in enumerate(entries):
        progress("descriptors", index, len(entries))
        path = work / "inputs" / entry["stored_name"]
        identity = entry["id"]
        try:
            if sha(path) != entry["sha256"]:
                raise ValueError("Input checksum mismatch.")
            entry["alignment"] = normalize_for_alignment(
                path, work / "alignment" / f"{identity}.pdb"
            )
            manifest_info = run_structural_pipeline(
                path, work / "calculations", prediction_id=identity, threads=1
            )
            original = Path(manifest_info["manifest_path"])
            report = assess_manifest(original)
            public = work / "artifacts" / identity
            public.mkdir(parents=True)
            # Keep component outputs and portable provenance together in the download.
            for item in original.parent.iterdir():
                if (
                    item.is_file()
                    and item.name != "COMPLETED.json"
                    and item.suffix in (".json", ".csv")
                ):
                    if item.suffix == ".json":
                        save(public / item.name, portable(json.loads(item.read_text())))
                    else:
                        shutil.copyfile(item, public / item.name)
            manifest_path = public / f"{identity}.manifest.json"
            report = assess_manifest(manifest_path)
            report = portable(report)
            save(public / f"{identity}.gates.json", report)
            shutil.copyfile(path, public / entry["stored_name"])
            reports[identity] = report
            successful.append(entry)
            results.append(
                {
                    "id": identity,
                    "filename": entry["filename"],
                    "state": "complete",
                    "classification": report["positive_reference_gates"][
                        "classification"
                    ],
                    "qc_status": report["quality_gate"]["qc_status"],
                    "source_sha256": entry["sha256"],
                    "alignment": entry["alignment"],
                    "metrics": row_from_report(report, entry),
                    "warnings": list(
                        dict.fromkeys(
                            report["quality_gate"]["failures"]
                            + report["quality_gate"]["warnings"]
                            + report["positive_reference_gates"]["warnings"]
                            + [
                                x
                                for values in report["quality_gate"][
                                    "component_failures"
                                ].values()
                                for x in values
                            ]
                        )
                    ),
                    "files": {
                        "report": f"{identity}/{identity}.gates.json",
                        "manifest": f"{identity}/{identity}.manifest.json",
                        "structure": f"{identity}/{entry['stored_name']}",
                    },
                }
            )
        except Exception as error:
            # The scientific worker log has diagnostics; do not return host paths.
            print(
                f"{identity}: {type(error).__name__}: {error}",
                file=sys.stderr,
                flush=True,
            )
            results.append(
                {
                    "id": identity,
                    "filename": entry["filename"],
                    "state": "failed",
                    "error": f"{type(error).__name__}: structural analysis did not complete. Check coordinate completeness, format, and assembly limits.",
                }
            )
    groups = {}
    group_results = []
    warnings = []
    for entry in successful:
        groups.setdefault(entry["alignment"]["construct_sha256"], []).append(entry)
    if len(groups) > 1:
        warnings.append(
            "Different chain sequences or stoichiometries were found. Comparisons and clustering were separated into construct groups."
        )
    executable = Path(os.environ.get("MMALIGN_BIN", "/usr/local/bin/MMalign"))
    for group_index, entries in enumerate(groups.values(), 1):
        group_id = f"group-{group_index:03d}"
        entries.sort(key=lambda e: e["id"])
        try:
            matrix = (
                matrix_for(entries, work, executable, progress)
                if len(entries) > 1
                else np.zeros((1, 1))
            )
            progress("clustering", group_index - 1, len(groups))
            output, frame = group_analysis(
                entries, reports, matrix, request["settings"]
            )
            target = work / "artifacts" / group_id
            target.mkdir(parents=True)
            ids = [e["id"] for e in entries]
            pd.DataFrame(matrix, index=ids, columns=ids).to_csv(
                target / "distance_matrix.csv"
            )
            export_frame = frame.copy()
            export_frame["method"] = export_frame["method"].map(
                lambda v: (
                    "'" + v
                    if isinstance(v, str) and v.lstrip()[:1] in ("=", "+", "-", "@")
                    else v
                )
            )
            export_frame.to_csv(target / "scored_members.csv", index=False)
            save(target / "clustering.json", output)
            save(
                target / "distance_matrix.json",
                {
                    "ids": ids,
                    "distances": matrix.tolist(),
                    "policy": "1 - mean of forward/reverse minimum length-normalized TM scores",
                },
            )
            group_results.append({"id": group_id, "ids": ids, **output})
        except Exception as error:
            print(
                f"{group_id}: {type(error).__name__}: {error}",
                file=sys.stderr,
                flush=True,
            )
            group_results.append(
                {
                    "id": group_id,
                    "ids": [e["id"] for e in entries],
                    "clustering_status": "failed",
                    "error": "Structural comparison or clustering failed. No missing distances were imputed and no shortlist was generated.",
                }
            )
    progress("reports", 0, 1)
    versions = {
        name: importlib.metadata.version(name)
        for name in [
            "amyloid-candidates",
            "numpy",
            "biopython",
            "freesasa",
            "pandas",
            "scipy",
            "scikit-learn",
            "hdbscan",
        ]
    }
    result = {
        "schema_version": "amyloid-analysis-job-1.0",
        "state": (
            "partial"
            if any(r["state"] == "failed" for r in results)
            or any(g["clustering_status"] == "failed" for g in group_results)
            else "completed"
        ),
        "structures": results,
        "groups": group_results,
        "warnings": warnings,
        "settings": request["settings"],
        "versions": versions,
        "python": platform.python_version(),
        "sources": json.loads((ROOT / "SCIENTIFIC_SOURCES.json").read_text()),
        "mmalign_binary_sha256": sha(executable) if executable.is_file() else None,
        "elapsed_seconds": time.time() - started,
        "scope": "Exploratory structural assessment; no predicted structures or benchmark outcomes were generated or read.",
    }
    artifacts = work / "artifacts"
    artifacts.mkdir(exist_ok=True)
    save(artifacts / "analysis.json", result)
    save(artifacts / "inputs.json", request)
    with (artifacts / "summary.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["id", "state", "classification", "qc_status", "warnings"],
        )
        writer.writeheader()
        for item in results:
            writer.writerow(
                {
                    k: (
                        "; ".join(item.get(k, []))
                        if k == "warnings"
                        else item.get(k, "")
                    )
                    for k in writer.fieldnames
                }
            )
    (artifacts / "READ-ME.txt").write_text(
        "Amyloid Candidates analysis\n\nScores are descriptors, not correctness probabilities. Inputs are grouped by exact chain sequence and stoichiometry for comparisons. First coordinate model only.\nMM-align: mean of forward/reverse min-normalized TM scores, distance=1-similarity. HDBSCAN EOM; settings and versions are in analysis.json. Small pools can be insufficient; noise is not forced into clusters.\nSelection uses the frozen A/I/S/R functions, four evidence components, A>=50, finite ipTM and pLDDT-derived eligibility, non-noise membership, and diversity distance>=0.20. Missing confidence is never invented. Medoids are geometric representatives, not necessarily supported candidates.\nUploaded pools and new binary/library environments are exploratory; exact archived partitions and benchmark recovery are not claimed.\nJSON paths were made portable and component/manifest hashes regenerated. Coordinates were copied unchanged. Alignment inputs use normalized C-alpha coordinates at 0.001 A precision, with recorded chain maps.\n"
    )
    for filename in [
        "PACKAGE-LICENSE.txt",
        "ENERGETICS-ATTRIBUTION.txt",
        "MMALIGN-LICENSE.txt",
        "SCIENTIFIC_SOURCES.json",
    ]:
        shutil.copyfile(ROOT / filename, artifacts / filename)
    for name in ["alignment", "pairs"]:
        if (work / name).exists():
            shutil.copytree(work / name, artifacts / name)
    save(
        artifacts / "checksums.json",
        {
            str(p.relative_to(artifacts)): sha(p)
            for p in sorted(artifacts.rglob("*"))
            if p.is_file()
        },
    )
    with zipfile.ZipFile(
        work / "results.zip", "w", compression=zipfile.ZIP_DEFLATED
    ) as archive:
        for path in sorted(artifacts.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(artifacts))
    save(work / "result.json", result)
    progress("complete", 1, 1)
    return result


def run(work):
    import fcntl

    work = Path(work)
    with (work / "pipeline.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if (work / "result.json").exists():
            raise ValueError("Results already exist; create a new job.")
        return _run(work)


if __name__ == "__main__":
    # Stop native subprocesses if the owning API process disappears unexpectedly.
    import threading
    import signal

    parent = os.getppid()

    def watch_parent():
        while True:
            time.sleep(2)
            if os.getppid() != parent:
                os.killpg(os.getpgrp(), signal.SIGKILL)

    if (
        os.environ.get("AMYLOID_OWNED_PROCESS_GROUP") == "1"
        and os.getpgrp() == os.getpid()
    ):
        threading.Thread(target=watch_parent, daemon=True).start()
    run(sys.argv[1])
