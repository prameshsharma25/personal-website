"""Generate synthetic native-HDBSCAN expectations, never private benchmark data."""

import importlib.metadata
import json
from pathlib import Path
import hdbscan
import numpy as np

assert (
    importlib.metadata.version("hdbscan") == "0.8.44"
), "Use the pinned native HDBSCAN version."
cases = []


def add(name, matrix, minimum=3, samples=2):
    labels = hdbscan.HDBSCAN(
        metric="precomputed",
        algorithm="generic",
        core_dist_n_jobs=1,
        min_cluster_size=minimum,
        min_samples=samples,
        gen_min_span_tree=True,
        cluster_selection_method="eom",
        cluster_selection_epsilon=0.0,
    ).fit_predict(matrix.copy())
    cases.append(
        {
            "name": name,
            "distances": matrix.tolist(),
            "settings": {
                "min_cluster_size": minimum,
                "min_samples": samples,
                "max_candidates": 10,
            },
            "native_labels": labels.tolist(),
        }
    )


for seed in range(5):
    rng = np.random.default_rng(seed)
    points = np.vstack(
        (
            rng.normal((0, 0), 0.025, (8, 2)),
            rng.normal((0.5, 0.5), 0.025, (8, 2)),
            rng.uniform(0, 0.5, (4, 2)),
        )
    )
    matrix = np.linalg.norm(points[:, None] - points[None, :], axis=-1)
    add(f"two_clusters_noise_seed_{seed}", matrix)
    if seed == 0:
        add("rounded_distances", np.round(matrix, 2))
matrix = np.full((20, 20), 0.9)
matrix[:10, :10] = 0.03
matrix[10:, 10:] = 0.03
np.fill_diagonal(matrix, 0)
add("default_settings_two_clusters", matrix, 10, 3)
add("two_tied_clusters", matrix, 3, 1)
matrix[:10, :10] = 0
matrix[10:, 10:] = 0
add("duplicate_points", matrix)
add("all_identical", np.zeros((12, 12)))
add("all_equidistant", np.ones((12, 12)) - np.eye(12))
add("minimum_pool", np.array([[0, 0.1, 0.8], [0.1, 0, 0.8], [0.8, 0.8, 0]]), 2, 1)
output = {
    "scope": "Synthetic validation matrices, not amyloid benchmark outcomes.",
    "native_backend": "hdbscan 0.8.44; generic, precomputed, EOM; min_samples excludes self",
    "cases": cases,
}
path = (
    Path(__file__).resolve().parents[1] / "tests/fixtures/amyloid-cluster-parity.json"
)
path.write_text(json.dumps(output, indent=2) + "\n")
print(f"Wrote {len(cases)} synthetic fixtures.")
