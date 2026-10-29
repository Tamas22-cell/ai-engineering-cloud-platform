import pytest

from rag.semantic_search import SemanticSearch


def test_semantic_search_ranking():
    search = SemanticSearch()

    search.add_documents(
        [
            {"text": "Python AI engineering", "page": 1},
            {"text": "Database administration", "page": 2},
            {"text": "Machine learning", "page": 3},
        ],
        [
            [1.0, 0.0],
            [0.0, 1.0],
            [0.8, 0.6],
        ],
    )

    results = search.search([1.0, 0.0], top_k=2)

    assert len(results) == 2
    assert results[0]["page"] == 1
    assert results[1]["page"] == 3
    assert results[0]["score"] >= results[1]["score"]


def test_semantic_search_empty_index():
    search = SemanticSearch()

    assert search.search([1.0, 0.0]) == []


def test_semantic_search_rejects_wrong_dimensions():
    search = SemanticSearch()

    search.add_documents(
        [{"text": "Python"}],
        [[1.0, 0.0]],
    )

    with pytest.raises(ValueError):
        search.search([1.0, 0.0, 0.0])


def test_semantic_search_rejects_zero_vectors():
    search = SemanticSearch()

    with pytest.raises(ValueError):
        search.add_documents(
            [{"text": "Python"}],
            [[0.0, 0.0]],
        )


def test_semantic_search_appends_documents():
    search = SemanticSearch()

    search.add_documents(
        [{"text": "Python"}],
        [[1.0, 0.0]],
    )

    search.add_documents(
        [{"text": "LangGraph"}],
        [[0.0, 1.0]],
    )

    assert len(search.documents) == 2
    assert len(search.search([1.0, 0.0], top_k=5)) == 2


def test_semantic_search_invalid_top_k():
    search = SemanticSearch()

    with pytest.raises(ValueError):
        search.search([1.0, 0.0], top_k=0)
