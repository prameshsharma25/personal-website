"""Explicit browser clustering backend; native jobs retain contrib hdbscan."""

from sklearn.cluster import HDBSCAN


def sklearn_labels(matrix, settings):
    # sklearn counts the point itself; the existing pipeline counts neighbors only.
    return HDBSCAN(
        metric="precomputed",
        algorithm="brute",
        n_jobs=1,
        copy=True,
        min_cluster_size=settings["min_cluster_size"],
        min_samples=settings["min_samples"] + 1,
        cluster_selection_method="eom",
        cluster_selection_epsilon=0.0,
        alpha=1.0,
        allow_single_cluster=False,
    ).fit_predict(matrix)
