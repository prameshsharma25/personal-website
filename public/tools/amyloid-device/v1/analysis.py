"""Browser I/O adapter. All scientific calculations use the unchanged package."""

from contextlib import contextmanager
from functools import wraps
import importlib
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import platform
import shutil
import time
import zipfile

import numpy as np
from amyloid_cross_check.common import load_assembly, run_structural_pipeline
from amyloid_cross_check.scoring_calibration.gates_cli import assess_manifest

WORK = Path("/device")
ARTIFACTS = WORK / "artifacts"
RESULTS = []
STARTED = time.perf_counter()
ENGINE = json.loads(_engine_json)
SETTINGS = json.loads(_settings_json)
BATCH = bool(_batch_enabled)
from device_progress import report as report_progress


@contextmanager
def observed_components():
    # Observe entry/return of the original functions; arguments and results are unchanged.
    replacements = []
    stages = [
        (
            "amyloid_cross_check.common.orchestrator",
            "analyze_assembly",
            "Quality And Repeats",
            1,
        ),
        (
            "amyloid_cross_check.geometry.score_geometry",
            "score_geometry",
            "Geometry",
            2,
        ),
        ("amyloid_cross_check.interface_dryness", "score_packing", "Packing", 3),
        ("amyloid_cross_check.energetics.scoring", "score_sawaya", "Energetics", 4),
    ]

    def observe(function, label, step):
        @wraps(function)
        def wrapped(*args, **kwargs):
            report_progress(label, step)
            result = function(*args, **kwargs)
            report_progress(label + " Complete", step + 1)
            return result

        return wrapped

    try:
        for module_name, name, label, step in stages:
            module = importlib.import_module(module_name)
            original = getattr(module, name)
            replacements.append((module, name, original))
            setattr(module, name, observe(original, label, step))
        yield
    finally:
        for module, name, original in replacements:
            setattr(module, name, original)


def clean(value):
    if isinstance(value, dict):
        return {str(k): clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, (float, np.floating)):
        return float(value) if math.isfinite(value) else None
    if isinstance(value, np.bool_):
        return bool(value)
    return value


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(clean(value), indent=2, allow_nan=False) + "\n")


def portable(value):
    if isinstance(value, dict):
        return {k: portable(v) for k, v in value.items() if k != "provenance"}
    if isinstance(value, list):
        return [portable(v) for v in value]
    if isinstance(value, str) and value.startswith("/"):
        return Path(value).name
    return value


def analyze_entry(entry_json):
    entry = json.loads(entry_json)
    identity = entry["id"]
    source = WORK / "inputs" / entry["stored_name"]
    public = ARTIFACTS / identity
    result = {"id": identity, "filename": entry["filename"]}
    try:
        report_progress("Reading Coordinates", 0)
        assembly = load_assembly(source, model_index=0)
        if len(assembly.atoms) > ENGINE["limits"]["max_atoms"]:
            raise ValueError(
                "This structure exceeds the on-device limit of 20,000 atoms in the first model."
            )
        if len(assembly.chains) > ENGINE["limits"]["max_chains"]:
            raise ValueError(
                "This structure exceeds the on-device limit of 32 polymer chains."
            )
        if not all(math.isfinite(v) for atom in assembly.atoms for v in atom.coord):
            raise ValueError("The structure contains non-finite coordinates.")
        if (
            sum(
                res.atom("CA") is not None
                for chain in assembly.chains.values()
                for res in chain.residues
            )
            < 3
        ):
            raise ValueError("At least three C-alpha atoms are required.")
        models = assembly.parse_report.total_models
        del assembly
        with observed_components():
            info = run_structural_pipeline(
                source, WORK / "calculations", prediction_id=identity, threads=1
            )
        report_progress("Warnings And Reports", 5)
        original = Path(info["manifest_path"])
        assess_manifest(original)
        public.mkdir(parents=True)
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
        report = portable(assess_manifest(public / f"{identity}.manifest.json"))
        save(public / f"{identity}.gates.json", report)
        shutil.copyfile(source, public / entry["stored_name"])
        if BATCH:
            REPORTS[identity] = report
            try:
                prepare_alignment(entry, source)
                result["alignment"] = entry["alignment"]
                result["confidence"] = entry["confidence"]
            except Exception as alignment_error:
                result["comparison_error"] = str(alignment_error)
        result.update(
            {
                "state": "complete",
                "classification": report["positive_reference_gates"]["classification"],
                "qc_status": report["quality_gate"]["qc_status"],
                "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                "model_index": 0,
                "models_in_source": models,
                "files": {
                    "report": f"{identity}/{identity}.gates.json",
                    "manifest": f"{identity}/{identity}.manifest.json",
                    "structure": f"{identity}/{entry['stored_name']}",
                },
            }
        )
    except Exception as error:
        shutil.rmtree(public, ignore_errors=True)
        message = (
            str(error)
            .replace(str(source), entry["filename"])
            .replace(str(WORK), "analysis")
        )
        result.update(
            {"state": "failed", "error": f"{type(error).__name__}: {message}"}
        )
    finally:
        # Release intermediate files between structures. Nothing is written to a host filesystem.
        shutil.rmtree(WORK / "calculations", ignore_errors=True)
        source.unlink(missing_ok=True)
    report_progress("Structure Finished", 6)
    RESULTS.append(result)
    return json.dumps(clean(result), allow_nan=False)


def finish():
    versions = {
        name: importlib.metadata.version(name)
        for name in [
            "amyloid-candidates",
            *ENGINE["dependencies"],
            *([] if not BATCH else ENGINE["batch_dependencies"]),
        ]
    }
    for name, expected in {
        **ENGINE["dependencies"],
        **(ENGINE["batch_dependencies"] if BATCH else {}),
    }.items():
        if versions[name] != expected:
            raise ValueError(
                f"Unexpected {name} version; this engine needs to be revalidated."
            )
    summary = {
        "schema_version": "amyloid-device-results-1.0",
        "execution": "browser_web_worker",
        "alignment_execution": json.loads(_alignment_execution_json),
        "structures": RESULTS,
        "elapsed_seconds": time.perf_counter() - STARTED,
        "clustering_status": "requested" if BATCH else "not_requested",
        "groups": GROUP_RESULTS if BATCH else [],
        "settings": SETTINGS if BATCH else None,
        "warnings": (
            (
                [
                    "Clustering uses scikit-learn HDBSCAN with min_samples adjusted to count neighboring structures. Tied distances can produce different partitions from the native hdbscan implementation."
                ]
                + (
                    [
                        "Different chain sequences or stoichiometries were found. Comparisons and clustering were separated into construct groups."
                    ]
                    if len(GROUPS) > 1
                    else []
                )
                + (
                    [
                        "Some structures could not be prepared for comparison; their individual descriptors are retained."
                    ]
                    if any("comparison_error" in r for r in RESULTS)
                    else []
                )
            )
            if BATCH
            else [
                "Structures were assessed independently; comparisons and clustering were not requested."
            ]
        ),
        "provenance": {
            "python": platform.python_version(),
            "versions": versions,
            "engine": ENGINE,
        },
    }
    if summary["alignment_execution"].get("fallback"):
        summary["warnings"].append(summary["alignment_execution"]["fallback"])
    save(ARTIFACTS / "results.json", summary)
    shutil.copytree("/research/licenses", ARTIFACTS / "licenses", dirs_exist_ok=True)
    if BATCH:
        for name in ("LICENSE.txt", "build.json"):
            shutil.copyfile(
                "/research/mmalign-" + name,
                ARTIFACTS / "licenses" / ("mmalign-" + name),
            )
    (ARTIFACTS / "README.txt").write_text(
        "Amyloid Candidates: Analysis On Your Device\n\n"
        "Calculations ran in your browser. No coordinates were uploaded. Only the first model (index 0) was assessed.\n"
        "See results.json for requested comparisons, clustering backend/settings, and group-level success or failure.\n"
        "MM-align compares only matching chain sequences and stoichiometries. Missing confidence is not inferred.\n"
        "Known-positive compatibility is not a probability of amyloid formation.\n\n"
        "For each successful structure, open its .gates.json, .manifest.json, and coordinate file\n"
        "together in Open Existing Reports. Original filenames and byte hashes are recorded in results.json.\n"
        "Component outputs accompany the portable manifests. Removed machine provenance is replaced\n"
        "by the source, adapter checksums, runtime, and dependency versions in results.json.\n\n"
        "Amyloid Candidates: Dr. Devlina Chakravarty, Pramesh Sharma, and Dr. Lauren L. Porter.\n"
        "Energetics adapts Amyloid Illustrator by Sawaya and Eisenberg (CC BY 4.0). See licenses/.\n"
    )
    save(
        ARTIFACTS / "SHA256.json",
        {
            str(p.relative_to(ARTIFACTS)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(ARTIFACTS.rglob("*"))
            if p.is_file()
        },
    )
    with zipfile.ZipFile(
        WORK / "amyloid-device-results.zip", "w", zipfile.ZIP_DEFLATED
    ) as bundle:
        for path in sorted(ARTIFACTS.rglob("*")):
            if path.is_file():
                bundle.write(path, path.relative_to(ARTIFACTS))
    return json.dumps(clean(summary), allow_nan=False)
