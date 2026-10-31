from unittest.mock import AsyncMock, MagicMock

import pytest

from rag.chunk_repository import save_document_chunks


def mock_db_with_owner(owned=True):
    db = AsyncMock()
    db.bind = None  # Explicit non-PostgreSQL mock; never infer dialect from AsyncMock
    result = MagicMock()
    result.scalar_one_or_none.return_value = (
        "doc-1" if owned else None
    )
    db.execute.return_value = result
    db.add = MagicMock()
    return db


@pytest.mark.asyncio
async def test_save_document_chunks_success():
    db = mock_db_with_owner()

    count = await save_document_chunks(
        db,
        user_id="user-A",
        document_id="doc-1",
        chunks=[
            {
                "page": 2,
                "chunk": 1,
                "text": "AI Engineering",
            }
        ],
        embeddings=[[0.1, 0.2, 0.3]],
    )

    assert count == 1
    db.add.assert_called_once()
    db.commit.assert_awaited_once()

    saved = db.add.call_args.args[0]
    assert saved.document_id == "doc-1"
    assert saved.page == 2
    assert saved.embedding == [0.1, 0.2, 0.3]


@pytest.mark.asyncio
async def test_save_rejects_other_user_document():
    db = mock_db_with_owner(owned=False)

    with pytest.raises(ValueError, match="Document not found"):
        await save_document_chunks(
            db, "user-B", "doc-1",
            [{"page": 1, "chunk": 1, "text": "Private"}],
            [[0.1, 0.2]],
        )

    db.add.assert_not_called()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_save_rejects_mismatched_counts():
    db = mock_db_with_owner()

    with pytest.raises(ValueError):
        await save_document_chunks(
            db, "user-A", "doc-1",
            [{"page": 1, "chunk": 1, "text": "Python"}],
            [],
        )

    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_save_rolls_back_on_error():
    db = mock_db_with_owner()
    db.commit.side_effect = RuntimeError("Database error")

    with pytest.raises(RuntimeError, match="Database error"):
        await save_document_chunks(
            db, "user-A", "doc-1",
            [{"page": 1, "chunk": 1, "text": "Python"}],
            [[0.1, 0.2]],
        )

    db.rollback.assert_awaited_once()
