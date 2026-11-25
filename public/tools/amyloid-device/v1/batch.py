"""Browser batch orchestration around shared normalization, parsing, and selection."""

import itertools
from analysis.browser_clustering import sklearn_labels
from analysis.alignment import parse, to_distance
from analysis.inputs import read_confidence
from analysis.pool import normalize_for_alignment, group_analysis

ENTRIES = {}
REPORTS = {}
GROUPS = []
GROUP_RESULTS = []
PAIR_RESULTS = {}
METADATA = (
    read_confidence(
        _confidence_csv, [item["name"] for item in json.loads(_filenames_json)]
    )
    if _confidence_csv
    else {}
)


def prepare_alignment(entry, source):
    entry["confidence"] = METADATA.get(entry["filename"], {})
    entry["alignment"] = normalize_for_alignment(
        source, ARTIFACTS / "alignment" / f"{entry['id']}.pdb"
    )
    ENTRIES[entry["id"]] = entry


def alignment_plan():
    by_construct = {}
    for result in RESULTS:
        if result["state"] == "complete" and result["id"] in ENTRIES:
            entry = ENTRIES[result["id"]]
            by_construct.setdefault(entry["alignment"]["construct_sha256"], []).append(
                entry
            )
    tasks = []
    for index, entries in enumerate(by_construct.values(), 1):
        entries.sort(key=lambda entry: entry["id"])
        group = {"id": f"group-{index:03d}", "entries": entries, "error": None}
        GROUPS.append(group)
        if len(entries) < 2:
            continue
        for i, j in itertools.chain(
            ((i, i) for i in range(len(entries))),
            itertools.combinations(range(len(entries)), 2),
        ):
            for a, b in ([(i, j)] if i == j else [(i, j), (j, i)]):
                tasks.append(
                    {"group": group["id"], "a": entries[a]["id"], "b": entries[b]["id"]}
                )
    return json.dumps({"tasks": tasks, "groups": len(GROUPS)})


def accept_alignment(task_json, stdout, error):
    task = json.loads(task_json)
    group = next(g for g in GROUPS if g["id"] == task["group"])
    if group["error"]:
        return
    try:
        if error:
            raise ValueError(error)
        parsed = parse(stdout)
        a, b = task["a"], task["b"]
        if (
            parsed["length1"] != ENTRIES[a]["alignment"]["ca_count"]
            or parsed["length2"] != ENTRIES[b]["alignment"]["ca_count"]
        ):
            raise ValueError("MM-align lengths disagree with the prepared coordinates.")
        if a == b and min(parsed["tm1"], parsed["tm2"]) < 1 - 1e-4:
            raise ValueError("MM-align self-alignment failed.")
        PAIR_RESULTS[(a, b)] = parsed
        save(ARTIFACTS / "pairs" / f"{a}-{b}.json", parsed)
    except Exception as problem:
        group["error"] = f"{type(problem).__name__}: {problem}"


def finish_group(index):
    group = GROUPS[index]
    entries, identity = group["entries"], group["id"]
    ids = [entry["id"] for entry in entries]
    try:
        if group["error"]:
            raise ValueError(group["error"])
        similarity = np.eye(len(entries))
        for i, j in itertools.combinations(range(len(entries)), 2):
            a, b = ids[i], ids[j]
            forward, reverse = PAIR_RESULTS[(a, b)], PAIR_RESULTS[(b, a)]
            similarity[i, j] = similarity[j, i] = (
                min(forward["tm1"], forward["tm2"])
                + min(reverse["tm1"], reverse["tm2"])
            ) / 2
        matrix = to_distance(similarity)
        output, frame = group_analysis(
            entries, REPORTS, matrix, SETTINGS, fit_labels=sklearn_labels
        )
        target = ARTIFACTS / identity
        target.mkdir(parents=True)
        save(
            target / "distance_matrix.json",
            {
                "ids": ids,
                "distances": matrix.tolist(),
                "policy": "1 - mean of forward/reverse minimum length-normalized TM scores",
            },
        )
        import pandas as pd

        pd.DataFrame(matrix, index=ids, columns=ids).to_csv(
            target / "distance_matrix.csv"
        )
        frame["method"] = frame["method"].map(
            lambda value: (
                "'" + value
                if isinstance(value, str) and value.lstrip()[:1] in ("=", "+", "-", "@")
                else value
            )
        )
        frame.to_csv(target / "scored_members.csv", index=False)
        output["clustering_backend"] = {
            "implementation": "sklearn.cluster.HDBSCAN",
            "version": importlib.metadata.version("scikit-learn"),
            "min_samples_neighbors": SETTINGS["min_samples"],
            "min_samples_including_self": SETTINGS["min_samples"] + 1,
            "algorithm": "brute",
            "metric": "precomputed",
            "cluster_selection_method": "eom",
            "alpha": 1.0,
            "cluster_selection_epsilon": 0.0,
            "allow_single_cluster": False,
        }
        save(target / "clustering.json", output)
        GROUP_RESULTS.append({"id": identity, "ids": ids, **output})
    except Exception as error:
        GROUP_RESULTS.append(
            {
                "id": identity,
                "ids": ids,
                "clustering_status": "failed",
                "error": f"{error} No distances were imputed; no shortlist was generated for this group.",
            }
        )
    return json.dumps(clean(GROUP_RESULTS[-1]), allow_nan=False)
