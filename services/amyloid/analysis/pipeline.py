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
import subprocess
import sys
import time
import zipfile
import numpy as np
import pandas as pd
from amyloid_cross_check.common import run_structural_pipeline
from amyloid_cross_check.scoring_calibration.gates_cli import assess_manifest
from .alignment import parse, to_distance
from .pool import sha, clean, normalize_for_alignment, row_from_report, group_analysis

ROOT = Path(__file__).resolve().parents[1]


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
