"""Portable structure normalization and pool selection shared by native and browser jobs."""

import hashlib
import json
import math
import os
from pathlib import Path
import string
import numpy as np
import pandas as pd
from amyloid_cross_check.common import load_assembly
from .selection import features, center, greedy


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


def group_analysis(entries, reports, matrix, settings, fit_labels=None):
    n = len(entries)
    labels = np.full(n, -1, dtype=int)
    ready = n >= max(settings["min_cluster_size"], settings["min_samples"] + 1)
    if ready:
        if fit_labels is not None:
            labels = fit_labels(matrix, settings)
        else:
            import hdbscan

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
