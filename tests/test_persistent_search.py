from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from rag.persistent_search import search_stored_documents


def make_db(rows):
    db = AsyncMock()
    result = MagicMock()
    result.all.return_value = rows
    db.execute.return_value = result
    return db


def make_chunk(document_id, page, embedding, text):
    return SimpleNamespace(
        document_id=document_id,
        page=page,
        chunk_number=1,
        embedding=embedding,
        text=text,
    )


@pytest.mark.asyncio
async def test_search_ranks_by_similarity():
    rows = [
        (make_chunk("doc-1", 1, [1.0, 0.0], "Python AI"), "first.pdf"),
        (make_chunk("doc-2", 2, [0.0, 1.0], "Database"), "second.pdf"),
        (make_chunk("doc-3", 3, [0.8, 0.6], "Machine learning"), "third.pdf"),
    ]
    db = make_db(rows)

    results = await search_stored_documents(
        db, "user-A", [1.0, 0.0], top_k=2
    )

    assert [item["page"] for item in results] == [1, 3]
    assert results[0]["source"] == "first.pdf"
    assert results[0]["score"] >= results[1]["score"]


@pytest.mark.asyncio
async def test_search_filters_by_user():
    db = make_db([])

    await search_stored_documents(
        db, "user-A", [1.0, 0.0]
    )

    statement = db.execute.await_args.args[0]
    assert "documents.user_id" in str(statement)
    assert statement.compile().params["user_id_1"] == "user-A"


@pytest.mark.asyncio
async def test_search_empty_documents():
    db = make_db([])

    assert await search_stored_documents(
        db, "user-A", [1.0, 0.0]
    ) == []


@pytest.mark.asyncio
async def test_search_invalid_top_k():
    db = make_db([])

    with pytest.raises(ValueError):
        await search_stored_documents(db, "user-A", [1.0, 0.0], top_k=0)

    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_search_skips_invalid_vectors():
    rows = [
        (make_chunk("doc-1", 1, [0.0, 0.0], "Zero"), "zero.pdf"),
        (make_chunk("doc-2", 2, [1.0, 0.0, 0.0], "Wrong size"), "wrong.pdf"),
        (make_chunk("doc-3", 3, [1.0, 0.0], "Valid"), "valid.pdf"),
    ]
    db = make_db(rows)

    results = await search_stored_documents(
        db, "user-A", [1.0, 0.0]
    )

    assert len(results) == 1
    assert results[0]["source"] == "valid.pdf"
