from unittest.mock import AsyncMock, patch

import pytest

from rag.persistent_qa import PersistentRAGQuestionAnswering


@pytest.mark.asyncio
async def test_persistent_qa_success():
    db = AsyncMock()
    embedding_service = AsyncMock()
    answer_generator = AsyncMock()

    embedding_service.embed_texts.return_value = [[1.0, 0.0]]

    documents = [{
        "document_id": "doc-1",
        "source": "manual.pdf",
        "page": 3,
        "text": "Python supports AI development.",
        "score": 0.95,
    }]

    answer_generator.generate_answer.return_value = {
        "answer": "Python supports AI development [1].",
        "sources": [{"id": 1, "source": "manual.pdf", "page": 3}],
    }

    qa = PersistentRAGQuestionAnswering(
        embedding_service=embedding_service,
        answer_generator=answer_generator,
    )

    with patch(
        "rag.persistent_qa.search_stored_documents",
        new_callable=AsyncMock,
        return_value=documents,
    ) as search:
        result = await qa.ask(
            db=db,
            user_id="user-A",
            question="What is Python?",
            top_k=3,
        )

    embedding_service.embed_texts.assert_awaited_once_with(
        ["What is Python?"]
    )

    search.assert_awaited_once_with(
        db=db,
        user_id="user-A",
        query_embedding=[1.0, 0.0],
        top_k=3,
    )

    answer_generator.generate_answer.assert_awaited_once_with(
        "What is Python?",
        documents,
    )

    assert result["sources"][0]["page"] == 3


@pytest.mark.asyncio
async def test_persistent_qa_rejects_empty_question():
    embedding_service = AsyncMock()
    qa = PersistentRAGQuestionAnswering(
        embedding_service=embedding_service,
        answer_generator=AsyncMock(),
    )

    with pytest.raises(ValueError, match="Question cannot be empty"):
        await qa.ask(AsyncMock(), "user-A", "   ")

    embedding_service.embed_texts.assert_not_awaited()


@pytest.mark.asyncio
async def test_persistent_qa_rejects_invalid_top_k():
    embedding_service = AsyncMock()
    qa = PersistentRAGQuestionAnswering(
        embedding_service=embedding_service,
        answer_generator=AsyncMock(),
    )

    with pytest.raises(ValueError):
        await qa.ask(AsyncMock(), "user-A", "Python", top_k=0)

    embedding_service.embed_texts.assert_not_awaited()


@pytest.mark.asyncio
async def test_persistent_qa_rejects_invalid_embedding_response():
    embedding_service = AsyncMock()
    embedding_service.embed_texts.return_value = []

    answer_generator = AsyncMock()

    qa = PersistentRAGQuestionAnswering(
        embedding_service=embedding_service,
        answer_generator=answer_generator,
    )

    with pytest.raises(ValueError, match="Invalid query embedding"):
        await qa.ask(AsyncMock(), "user-A", "Python")

    answer_generator.generate_answer.assert_not_awaited()
