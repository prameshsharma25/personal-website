"""Export portable website examples from the pinned Amyloid Candidates pilot run.

Usage: python scripts/export-amyloid-examples.py PACKAGE_DIR RESULTS_DIR
Run examples/pilot5/run.py for targets 2BEG and 6QJH first. No scientific value
or decision is changed: only local provenance paths and the manifest byte hash.
"""
import hashlib
import json
import shutil
import sys
from pathlib import Path

PIN = '1c85221ea38ffbaa1695eeb0a2962997abf94563'
package, results = map(Path, sys.argv[1:3])
out = Path(__file__).resolve().parents[1] / 'public/tools/amyloid-example'
out.mkdir(parents=True, exist_ok=True)
cases = json.loads((package / 'examples/pilot5/cases.json').read_text())['cases']

def portable(value):
    if isinstance(value, dict):
        return {key: portable(item) for key, item in value.items() if key != 'provenance'}
    if isinstance(value, list):
        return [portable(item) for item in value]
    if isinstance(value, str) and value.startswith('/'):
        return Path(value).name
    return value

for case in cases:
    if case['target'] not in ('2BEG', '6QJH'):
        continue
    prediction = case['prediction_id']
    stem = case['target'].lower()
    original = results / prediction
    raw_manifest = (original / f'{prediction}.manifest.json').read_bytes()
    report = json.loads((original / f'{prediction}.gates.json').read_bytes())
    assert hashlib.sha256(raw_manifest).hexdigest() == report['source_manifest']['sha256']
    source = package / 'examples/pilot5' / case['structure']
    assert hashlib.sha256(source.read_bytes()).hexdigest() == case['sha256']
    manifest = portable(json.loads(raw_manifest))
    assert manifest['source_file_sha256'] == case['sha256']
    manifest_bytes = (json.dumps(manifest, indent=2, sort_keys=True) + '\n').encode()
    (out / f'{stem}.manifest.json').write_bytes(manifest_bytes)
    report = portable(report)
    report['source_manifest']['sha256'] = hashlib.sha256(manifest_bytes).hexdigest()
    report['source_manifest']['path'] = f'{stem}.manifest.json'
    (out / f'{stem}.gates.json').write_text(json.dumps(report, indent=2, sort_keys=True) + '\n')
    shutil.copyfile(source, out / f'{stem}.pdb')
shutil.copyfile(package / 'LICENSE', out / 'PACKAGE-LICENSE.txt')
shutil.copyfile(package / 'docs/ATTRIBUTION.md', out / 'ENERGETICS-ATTRIBUTION.txt')
(out / 'README.txt').write_text(f'''Calculated examples for the Amyloid Warning Inspector
Source: https://github.com/DevlinaC/Amyloid_Candidates/tree/{PIN}
Package: amyloid-candidates 0.1.0.dev0
Generated using Python 3.13.7, NumPy 2.5.5, Biopython 1.88, FreeSASA 2.2.1.

2BEG: ESMFold2 prediction; 6QJH: Boltz-2 prediction.
These are public predicted-coordinate fixtures, not experimental structures.
Scores and decisions come from the package's pilot runner and amyloid-gates.
Absolute paths were reduced to basenames and machine provenance was removed
from these portable copies. The gate's manifest hash was updated accordingly.
The component JSON files are not included; run the package to regenerate them.
Coordinate bytes, component hashes, scientific features, and decisions are unchanged.

Project code: MIT. Sawaya-derived energetic algorithm: CC BY 4.0.
See PACKAGE-LICENSE.txt and ENERGETICS-ATTRIBUTION.txt for attribution.
''')
