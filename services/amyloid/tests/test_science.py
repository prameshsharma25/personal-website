import json
from pathlib import Path
import numpy as np
from analysis.pipeline import group_analysis
from analysis.alignment import to_distance

FIXTURES = Path(__file__).resolve().parents[3] / "public/tools/amyloid-example"


def report():
    return json.loads((FIXTURES / "2beg.gates.json").read_text())


def test_clustering_and_shortlist_missing_confidence():
    entries = [{"id": f"model-{i}"} for i in range(8)]
    reports = {e["id"]: report() for e in entries}
    matrix = np.full((8, 8), 0.9)
    matrix[:4, :4] = 0.03
    matrix[4:, 4:] = 0.03
    np.fill_diagonal(matrix, 0)
    result, _ = group_analysis(
        entries,
        reports,
        matrix,
        {"min_cluster_size": 3, "min_samples": 1, "max_candidates": 10},
    )
    assert result["clustering_status"] == "complete"
    assert len(result["representatives"]) == 2
    assert result["shortlist"] == []
    assert all(
        "confidence_not_provided" in m["eligibility_reasons"] for m in result["members"]
    )
    assert all(m["rank_score"] is None for m in result["members"])


def test_small_pool_not_fabricated_as_cluster():
    entries = [{"id": "a"}, {"id": "b"}]
    result, _ = group_analysis(
        entries,
        {e["id"]: report() for e in entries},
        np.zeros((2, 2)),
        {"min_cluster_size": 10, "min_samples": 3, "max_candidates": 10},
    )
    assert result["clustering_status"] == "insufficient_pool_size"
    assert all(m["cluster"] is None for m in result["members"])


def test_available_confidence_enables_frozen_formula_and_diversity():
    entries = [
        {
            "id": f"model-{i}",
            "confidence": {"method": "test", "iptm": 0.8, "mean_plddt": 80},
        }
        for i in range(8)
    ]
    matrix = np.full((8, 8), 0.9)
    matrix[:4, :4] = 0.03
    matrix[4:, 4:] = 0.03
    np.fill_diagonal(matrix, 0)
    result, _ = group_analysis(
        entries,
        {e["id"]: report() for e in entries},
        matrix,
        {"min_cluster_size": 3, "min_samples": 1, "max_candidates": 10},
    )
    assert len(result["shortlist"]) == 2
    indices = [int(name.split("-")[1]) for name in result["shortlist"]]
    assert matrix[indices[0], indices[1]] >= 0.2


def test_incomplete_mmalign_is_rejected():
    import pytest

    with pytest.raises(ValueError):
        to_distance([[1, float("nan")], [float("nan"), 1]])
    with pytest.raises(ValueError):
        to_distance([[1, 0.2], [0.3, 1]])


def test_candidate_budgets_are_nested_without_relaxing_diversity():
    # Three clusters with eight eligible members each. Their within-cluster
    # distances still exceed the diversity threshold, so the budget is binding.
    entries = [
        {"id": f"model-{i:03d}", "confidence": {"method": "test", "iptm": 0.8, "mean_plddt": 80}}
        for i in range(24)
    ]
    reports = {entry["id"]: report() for entry in entries}
    labels = np.repeat(np.arange(3), 8)
    matrix = np.where(labels[:, None] == labels[None, :], 0.25, 0.9)
    np.fill_diagonal(matrix, 0)
    selections = []
    for budget in [5, 10, 15, 20]:
        result, _ = group_analysis(
            entries, reports, matrix,
            {"min_cluster_size": 3, "min_samples": 1, "max_candidates": budget},
            fit_labels=lambda distance, settings: labels,
        )
        assert len(result["shortlist"]) == budget
        selections.append(result["shortlist"])
    for chosen in selections:
        assert chosen == selections[-1][:len(chosen)]

    # The larger budget cannot force redundant candidates into the shortlist.
    matrix[labels[:, None] == labels[None, :]] = 0.03
    np.fill_diagonal(matrix, 0)
    result, _ = group_analysis(
        entries, reports, matrix,
        {"min_cluster_size": 3, "min_samples": 1, "max_candidates": 20},
        fit_labels=lambda distance, settings: labels,
    )
    assert len(result["shortlist"]) == 3


def test_browser_clustering_preserves_partition_and_selection_conventions():
    from analysis.browser_clustering import sklearn_labels

    fixtures = (
        Path(__file__).resolve().parents[3]
        / "tests/fixtures/amyloid-cluster-parity.json"
    )
    for case in json.loads(fixtures.read_text())["cases"]:
        expected = np.array(case["native_labels"])
        actual = sklearn_labels(np.array(case["distances"]), case["settings"])
        assert np.array_equal(actual < 0, expected < 0), case["name"]
        assert np.array_equal(
            actual[:, None] == actual[None, :], expected[:, None] == expected[None, :]
        ), case["name"]
    matrix = np.full((8, 8), 0.9)
    matrix[:4, :4] = 0.03
    matrix[4:, 4:] = 0.03
    np.fill_diagonal(matrix, 0)
    settings = {"min_cluster_size": 3, "min_samples": 1, "max_candidates": 10}
    entries = [
        {
            "id": f"model-{i}",
            "confidence": {"method": "test", "iptm": 0.8, "mean_plddt": 80},
        }
        for i in range(8)
    ]
    reports = {entry["id"]: report() for entry in entries}
    native, _ = group_analysis(entries, reports, matrix, settings)
    browser, _ = group_analysis(
        entries, reports, matrix, settings, fit_labels=sklearn_labels
    )
    assert native == browser
