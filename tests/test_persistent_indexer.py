from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from rag.persistent_indexer import index_stored_pdf


@pytest.mark.asyncio
async def test_index_stored_pdf_success():
    db = AsyncMock()
    service = AsyncMock()

    document = SimpleNamespace(
        filename="manual.pdf",
        file_data=b"mock-pdf",
    )

    chunks = [
        {"source": "manual.pdf", "page": 1,
         "chunk": 1, "text": "Python AI"}
    ]

    service.embed_texts.return_value = [[0.1, 0.2]]

    with (
        patch(
            "rag.persistent_indexer.get_user_document",
            new_callable=AsyncMock,
            return_value=document,
        ),
        patch("rag.persistent_indexer.PdfReader") as reader,
        patch(
            "rag.persistent_indexer.split_document_pages",
            return_value=chunks,
        ),
        patch(
            "rag.persistent_indexer.save_document_chunks",
            new_callable=AsyncMock,
            return_value=1,
        ) as save,
    ):
        reader.return_value.pages = [
            SimpleNamespace(extract_text=lambda: "Python AI")
        ]

        count = await index_stored_pdf(
            db, "user-A", "doc-1", service
        )

    assert count == 1
    service.embed_texts.assert_awaited_once_with(["Python AI"])
    save.assert_awaited_once()
    assert save.await_args.kwargs["user_id"] == "user-A"
    assert save.await_args.kwargs["document_id"] == "doc-1"


@pytest.mark.asyncio
async def test_index_rejects_other_user_document():
    db = AsyncMock()
    service = AsyncMock()

    with patch(
        "rag.persistent_indexer.get_user_document",
        new_callable=AsyncMock,
        return_value=None,
    ):
        with pytest.raises(ValueError, match="Document not found"):
            await index_stored_pdf(db, "user-B", "doc-1", service)

    service.embed_texts.assert_not_awaited()


@pytest.mark.asyncio
async def test_index_rejects_empty_pdf():
    db = AsyncMock()
    service = AsyncMock()

    document = SimpleNamespace(
        filename="empty.pdf",
        file_data=b"mock-pdf",
    )

    with (
        patch(
            "rag.persistent_indexer.get_user_document",
            new_callable=AsyncMock,
            return_value=document,
        ),
        patch("rag.persistent_indexer.PdfReader") as reader,
    ):
        reader.return_value.pages = [
            SimpleNamespace(extract_text=lambda: "")
        ]

        with pytest.raises(
            ValueError, match="no extractable text"
        ):
            await index_stored_pdf(db, "user-A", "doc-1", service)

    service.embed_texts.assert_not_awaited()
