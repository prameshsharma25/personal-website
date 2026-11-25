"""Verify every archive checksum, then compare science independently of timestamps."""
import hashlib
import json
import sys
import zipfile


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


with zipfile.ZipFile(sys.argv[1]) as archive:
    hashes = json.loads(archive.read("SHA256.json"))
    assert set(hashes) == set(archive.namelist()) - {"SHA256.json"}
    for name, expected in hashes.items():
        assert digest(archive.read(name)) == expected, name

    def component(name):
        raw = archive.read(name)
        if not name.endswith(".json"):
            return raw
        data = json.loads(raw)
        if name.endswith(".energy.json"):
            # The upstream energy report timestamps each run. Do not change
            # the exported report, only its scientific comparison fingerprint.
            data.get("metadata", {}).pop("created_utc", None)
        if name.endswith(".gates.json"):
            energy = data["component_inputs"]["energy"]
            energy_path = name.rsplit("/", 1)[0] + "/" + energy["path"]
            assert energy["sha256"] == digest(archive.read(energy_path))
            energy["sha256"] = digest(component(energy_path))
        return encoded(data)

    summary = json.loads(archive.read("results.json"))
    components = {
        name: digest(component(name))
        for name in sorted(hashes)
        if name.startswith(("model-", "group-", "pairs/", "alignment/"))
    }
    print(json.dumps({"components": components, "structures": summary["structures"], "groups": summary["groups"]}))
