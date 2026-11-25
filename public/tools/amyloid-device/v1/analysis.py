"""Browser I/O adapter. All scientific calculations use the unchanged package."""

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
        assembly = load_assembly(source, model_index=0)
        if len(assembly.atoms) > ENGINE["limits"]["max_atoms"]:
            raise ValueError("This structure exceeds the on-device limit of 20,000 atoms in the first model.")
        if len(assembly.chains) > ENGINE["limits"]["max_chains"]:
            raise ValueError("This structure exceeds the on-device limit of 32 polymer chains.")
        if not all(math.isfinite(v) for atom in assembly.atoms for v in atom.coord):
            raise ValueError("The structure contains non-finite coordinates.")
        if sum(res.atom("CA") is not None for chain in assembly.chains.values() for res in chain.residues) < 3:
            raise ValueError("At least three C-alpha atoms are required.")
        models = assembly.parse_report.total_models
        del assembly
        info = run_structural_pipeline(source, WORK / "calculations", prediction_id=identity, threads=1)
        original = Path(info["manifest_path"])
        assess_manifest(original)
        public.mkdir(parents=True)
        for item in original.parent.iterdir():
            if item.is_file() and item.name != "COMPLETED.json" and item.suffix in (".json", ".csv"):
                if item.suffix == ".json":
                    save(public / item.name, portable(json.loads(item.read_text())))
                else:
                    shutil.copyfile(item, public / item.name)
        report = portable(assess_manifest(public / f"{identity}.manifest.json"))
        save(public / f"{identity}.gates.json", report)
        shutil.copyfile(source, public / entry["stored_name"])
        result.update({
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
        })
    except Exception as error:
        shutil.rmtree(public, ignore_errors=True)
        message = str(error).replace(str(source), entry["filename"]).replace(str(WORK), "analysis")
        result.update({"state": "failed", "error": f"{type(error).__name__}: {message}"})
    finally:
        # Release intermediate files between structures. Nothing is written to a host filesystem.
        shutil.rmtree(WORK / "calculations", ignore_errors=True)
        source.unlink(missing_ok=True)
    RESULTS.append(result)
    return json.dumps(clean(result), allow_nan=False)


def finish():
    versions = {name: importlib.metadata.version(name) for name in ["amyloid-candidates", "numpy", "biopython", "freesasa"]}
    for name, expected in ENGINE["dependencies"].items():
        if versions[name] != expected:
            raise ValueError(f"Unexpected {name} version; this engine needs to be revalidated.")
    summary = {
        "schema_version": "amyloid-device-results-1.0",
        "execution": "browser_web_worker",
        "structures": RESULTS,
        "elapsed_seconds": time.perf_counter() - STARTED,
        "clustering_status": "not_run_on_device",
        "warnings": ["Each structure was assessed independently. Pairwise alignment, clustering, pool-relative ranking, and shortlisting were not run."],
        "provenance": {"python": platform.python_version(), "versions": versions, "engine": ENGINE},
    }
    save(ARTIFACTS / "results.json", summary)
    shutil.copytree("/research/licenses", ARTIFACTS / "licenses", dirs_exist_ok=True)
    (ARTIFACTS / "README.txt").write_text(
        "Amyloid Candidates — On-Device Analysis\n\n"
        "All structures were processed independently in your browser. No coordinates were uploaded.\n"
        "Only the first model (index 0) was assessed. Clustering, alignment, pool-relative ranking,\n"
        "and shortlisting were not run. Known-positive compatibility is not a probability of amyloid formation.\n\n"
        "For each successful structure, open its .gates.json, .manifest.json, and coordinate file\n"
        "together in Open Existing Reports. Original filenames and byte hashes are recorded in results.json.\n"
        "Component outputs accompany the portable manifests. Removed machine provenance is replaced\n"
        "by the source, adapter checksums, runtime, and dependency versions in results.json.\n\n"
        "Amyloid Candidates: Dr. Devlina Chakravarty, Pramesh Sharma, and Dr. Lauren L. Porter.\n"
        "Energetics adapts the Sawaya–Eisenberg Amyloid Illustrator (CC BY 4.0). See licenses/.\n"
    )
    save(ARTIFACTS / "SHA256.json", {str(p.relative_to(ARTIFACTS)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(ARTIFACTS.rglob("*")) if p.is_file()})
    with zipfile.ZipFile(WORK / "amyloid-device-results.zip", "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in sorted(ARTIFACTS.rglob("*")):
            if path.is_file():
                bundle.write(path, path.relative_to(ARTIFACTS))
    return json.dumps(clean(summary), allow_nan=False)
