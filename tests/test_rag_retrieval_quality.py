import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from rag.persistent_search import search_stored_documents


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "rag_retrieval_eval.json"


def _evaluation_rows(corpus):
    rows = []
    for item in corpus:
        chunk = SimpleNamespace(
            document_id=item["document_id"],
            page=item["page"],
            chunk_number=item["chunk"],
            embedding=item["embedding"],
            text=item["text"],
        )
        rows.append((chunk, item["filename"]))
    return rows


@pytest.mark.asyncio
async def test_golden_rag_retrieval_quality():
    """Measure persistent cosine ranking with Recall@k and mean reciprocal rank.

    Fixture vectors are deterministic and synthetic: this checks retrieval
    ranking behavior, not the quality of a live embedding provider.
    """
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    corpus = fixture["corpus"]
    text_to_chunk_id = {item["text"]: item["chunk_id"] for item in corpus}
    rows = _evaluation_rows(corpus)
    recall_scores = []
    reciprocal_ranks = []

    for case in fixture["queries"]:
        db = AsyncMock()
        db.bind = None  # Force the portable cosine-search path for this fixture.
        result = MagicMock()
        result.all.return_value = rows
        db.execute.return_value = result

        hits = await search_stored_documents(
            db,
            "rag-evaluation-user",
            case["embedding"],
            top_k=fixture["top_k"],
        )
        retrieved = [text_to_chunk_id[hit["text"]] for hit in hits]
        relevant = set(case["relevant_chunk_ids"])
        recall_scores.append(len(set(retrieved) & relevant) / len(relevant))

        first_relevant_rank = next(
            (rank for rank, chunk_id in enumerate(retrieved, start=1)
             if chunk_id in relevant),
            None,
        )
        reciprocal_ranks.append(1 / first_relevant_rank if first_relevant_rank else 0)

    recall_at_k = sum(recall_scores) / len(recall_scores)
    mean_reciprocal_rank = sum(reciprocal_ranks) / len(reciprocal_ranks)

    assert recall_at_k >= 0.95, f"Recall@{fixture['top_k']} was {recall_at_k:.3f}"
    assert mean_reciprocal_rank >= 0.95, (
        f"MRR was {mean_reciprocal_rank:.3f}"
    )
