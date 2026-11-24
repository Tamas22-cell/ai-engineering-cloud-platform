import pytest

from evaluate_rag_embeddings import score_retrieval


def test_score_retrieval_returns_recall_and_mrr_at_k():
    metrics = score_retrieval(
        ["distractor", "relevant-a", "relevant-b"],
        {"relevant-a", "relevant-b"},
        top_k=3,
    )

    assert metrics["recall_at_k"] == 1.0
    assert metrics["reciprocal_rank_at_k"] == 0.5


def test_score_retrieval_zero_when_relevant_passage_is_outside_cutoff():
    metrics = score_retrieval(
        ["distractor-a", "distractor-b", "relevant"],
        {"relevant"},
        top_k=2,
    )

    assert metrics["recall_at_k"] == 0.0
    assert metrics["reciprocal_rank_at_k"] == 0.0


def test_score_retrieval_requires_gold_labels():
    with pytest.raises(ValueError, match="at least one relevant passage"):
        score_retrieval(["passage"], set(), top_k=3)
