from unittest.mock import AsyncMock, MagicMock

import pytest

from rag.document_repository import (
    get_user_document,
    list_user_documents,
)


@pytest.mark.asyncio
async def test_get_document_filters_by_owner():
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    db.execute.return_value = result_mock

    result = await get_user_document(
        db,
        user_id="user-A",
        document_id="document-B",
    )

    assert result is None

    statement = db.execute.await_args.args[0]
    sql = str(statement)

    assert "documents.id" in sql
    assert "documents.user_id" in sql
    assert "AND" in sql.upper()


@pytest.mark.asyncio
async def test_get_document_returns_owned_document():
    db = AsyncMock()

    document = MagicMock()
    document.user_id = "user-A"

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = document
    db.execute.return_value = result_mock

    result = await get_user_document(
        db, "user-A", "document-1"
    )

    assert result is document


@pytest.mark.asyncio
async def test_list_documents_filters_by_owner():
    db = AsyncMock()

    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = []
    db.execute.return_value = result_mock

    result = await list_user_documents(db, "user-A")

    assert result == []

    statement = db.execute.await_args.args[0]
    assert "documents.user_id" in str(statement)
    assert "LIMIT" in str(statement).upper()


@pytest.mark.asyncio
async def test_list_documents_rejects_invalid_limit():
    db = AsyncMock()

    with pytest.raises(ValueError):
        await list_user_documents(db, "user-A", limit=0)

    with pytest.raises(ValueError):
        await list_user_documents(db, "user-A", limit=101)

    db.execute.assert_not_awaited()
