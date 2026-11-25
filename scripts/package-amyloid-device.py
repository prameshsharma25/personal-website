"""Bundle the unchanged, pinned public package for the browser (no research data)."""

import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import zipfile

COMMIT = "1c85221ea38ffbaa1695eeb0a2962997abf94563"
ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "public/tools/amyloid-device/v1"
source = Path(sys.argv[1]).resolve()
git = (
    "/Library/Developer/CommandLineTools/usr/bin/git"
    if sys.platform == "darwin"
    else "git"
)
archive = subprocess.check_output(
    [git, "archive", COMMIT, "src", "LICENSE", "docs/ATTRIBUTION.md"], cwd=source
)
contents = {}
with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
    for member in tar.getmembers():
        if not member.isfile():
            continue
        name = member.name
        if name.startswith("src/"):
            contents[name[4:]] = tar.extractfile(member).read()
        else:
            contents["licenses/" + Path(name).name] = tar.extractfile(member).read()
contents["amyloid_candidates-0.1.0.dev0.dist-info/METADATA"] = (
    "Metadata-Version: 2.1\nName: amyloid-candidates\nVersion: 0.1.0.dev0\n"
    "License-Expression: MIT AND CC-BY-4.0\n"
).encode()
TARGET.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(TARGET / "package.zip", "w", zipfile.ZIP_DEFLATED) as bundle:
    for name, data in sorted(contents.items()):
        info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        bundle.writestr(info, data)
pipeline = {
    f"analysis/{name}": (ROOT / "services/amyloid/analysis" / name).read_bytes()
    for name in [
        "__init__.py",
        "pool.py",
        "alignment.py",
        "selection.py",
        "inputs.py",
        "browser_clustering.py",
    ]
}
with zipfile.ZipFile(TARGET / "pipeline.zip", "w", zipfile.ZIP_DEFLATED) as bundle:
    for name, data in sorted(pipeline.items()):
        info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        bundle.writestr(info, data)
manifest = {
    # Prior coordinator/storage release; runtime/scientific hash must also match.
    "checkpoint_compatible_engines": [{"engine":"d41a5f7743f755ac61cc5c39be21efb72f9aa3d7c3e9d7ee2deb8156fa7e8cec","science":"70a4e9131b557a941ef1b54faae2502be8e43dcdf470b76d13345ce5974dfe5c"}, {"engine":"bb4f296c5bc18f600aa417aba2a47ad34d7ca070b37932dc87303d88dff813e5","science":"70a4e9131b557a941ef1b54faae2502be8e43dcdf470b76d13345ce5974dfe5c"}],
    "schema_version": "amyloid-device-engine-1.0",
    "package_commit": COMMIT,
    "package_url": "https://github.com/DevlinaC/Amyloid_Candidates",
    "pyodide": "314.0.8",
    "runtime_url": "https://cdn.jsdelivr.net/pyodide/v314.0.8/full/",
    "dependencies": {"numpy": "2.4.6", "biopython": "1.87", "freesasa": "2.2.1"},
    "batch_dependencies": {
        "pandas": "3.0.2",
        "scikit-learn": "1.8.0",
        "scipy": "1.18.0",
    },
    "limits": {
        "max_files": 125,
        "max_file_bytes": 10 * 1024**2,
        "max_total_bytes": 100 * 1024**2,
        "max_atoms": 20000,
        "max_chains": 32,
    },
    "files": {
        name: hashlib.sha256((TARGET / name).read_bytes()).hexdigest()
        for name in [
            "package.zip",
            "analysis.py",
            "worker.mjs",
            "checkpoints.mjs",
            "pipeline.zip",
            "batch.py",
            "run-mmalign.mjs",
            "diagnostics.mjs",
            "alignment-worker.mjs",
            "descriptor-worker.mjs",
            "descriptor-scheduler.mjs",
            "alignment-scheduler.mjs",
            "mmalign/mmalign.mjs",
            "mmalign/mmalign.wasm",
            "mmalign/LICENSE.txt",
            "mmalign/build.json",
        ]
    },
    "pipeline_files": {
        name: hashlib.sha256(data).hexdigest()
        for name, data in sorted(pipeline.items())
    },
    "source_files": {
        name: hashlib.sha256(data).hexdigest()
        for name, data in sorted(contents.items())
    },
}
(TARGET / "engine.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(
    f"Bundled {len(contents)} files from {COMMIT}; {(TARGET / 'package.zip').stat().st_size} bytes."
)
