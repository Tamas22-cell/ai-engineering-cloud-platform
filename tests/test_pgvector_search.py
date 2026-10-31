from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from rag.persistent_search import search_stored_documents


@pytest.mark.asyncio
async def test_pgvector_query_uses_tenant_filter_and_top_k():
    db = AsyncMock()
    db.bind = SimpleNamespace(dialect=SimpleNamespace(name="postgresql"))
    result = MagicMock()
    result.mappings.return_value.all.return_value = [{
        "document_id": "doc-1",
        "source": "source.pdf",
        "page": 1,
        "chunk": 1,
        "text": "Relevant",
        "score": 0.95,
    }]
    db.execute.return_value = result

    hits = await search_stored_documents(
        db, "user-1", [1.0] * 1536, top_k=3,
    )

    statement, params = db.execute.await_args.args
    sql = str(statement)
    assert "embedding_vector <=>" in sql
    assert "d.user_id = :user_id" in sql
    assert params["user_id"] == "user-1"
    assert params["top_k"] == 3
    assert hits[0]["source"] == "source.pdf"
