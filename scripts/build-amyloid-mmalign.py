"""Reproduce the browser MM-align binary from checksummed, unchanged public source."""

import argparse
import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request

COMMIT = "23f14ffcf8647f2dc1c0e01043db3a7f3a661c28"
ARCHIVE_SHA = "2d485ac1e10ce04ce78372d4c7ea9b59567cffe3fa0463882b17bd71e9f79765"
URL = f"https://codeload.github.com/pylelab/USalign/tar.gz/{COMMIT}"
FLAGS = [
    "-O3",
    "-ffast-math",
    "-sALLOW_MEMORY_GROWTH=1",
    "-sINITIAL_MEMORY=33554432",
    "-sMAXIMUM_MEMORY=1073741824",
    "-sSTACK_SIZE=5242880",
    "-sMODULARIZE=1",
    "-sEXPORT_ES6=1",
    "-sEXPORT_NAME=createMMalign",
    "-sENVIRONMENT=worker,node",
    "-sINVOKE_RUN=0",
    "-sEXIT_RUNTIME=0",
    "-sEXPORTED_RUNTIME_METHODS=FS,callMain",
    "-sFORCE_FILESYSTEM=1",
    "-sASSERTIONS=1",
]
parser = argparse.ArgumentParser()
parser.add_argument(
    "emxx", help="Path to Emscripten 4.0.10 em++ (with its SDK activated)."
)
parser.add_argument(
    "--archive",
    type=Path,
    help="Optional cached source archive; checksum is always verified.",
)
args = parser.parse_args()
version = subprocess.check_output([args.emxx, "--version"], text=True).splitlines()[0]
if "4.0.10" not in version:
    raise SystemExit(
        "Use Emscripten 4.0.10; changing the toolchain requires numerical revalidation."
    )
source = (
    args.archive.read_bytes()
    if args.archive
    else urllib.request.urlopen(URL, timeout=60).read()
)
if hashlib.sha256(source).hexdigest() != ARCHIVE_SHA:
    raise SystemExit("Source archive checksum mismatch.")
target = Path(__file__).resolve().parents[1] / "public/tools/amyloid-device/v1/mmalign"
target.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix="amyloid-mmalign-build-") as directory:
    with tarfile.open(fileobj=io.BytesIO(source)) as archive:
        archive.extractall(directory, filter="data")
    root = Path(directory) / f"USalign-{COMMIT}"
    subprocess.run(
        [args.emxx, "MMalign.cpp", *FLAGS, "-o", str(target / "mmalign.mjs")],
        cwd=root,
        check=True,
    )
    shutil.copyfile(root / "LICENSE", target / "LICENSE.txt")
    sources = {
        path.name: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(root.iterdir())
        if path.suffix in (".h", ".cpp")
    }
record = {
    "source_commit": COMMIT,
    "source_archive_url": URL,
    "source_archive_sha256": ARCHIVE_SHA,
    "source_unmodified": True,
    "emscripten_version": "4.0.10",
    "flags": FLAGS,
    "source_files": sources,
    "artifacts": {
        name: hashlib.sha256((target / name).read_bytes()).hexdigest()
        for name in ["mmalign.mjs", "mmalign.wasm", "LICENSE.txt"]
    },
}
(target / "build.json").write_text(json.dumps(record, indent=2) + "\n")
print("Built MM-align WebAssembly from", COMMIT)
