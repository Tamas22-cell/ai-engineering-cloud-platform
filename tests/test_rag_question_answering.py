from unittest.mock import AsyncMock

import pytest

from rag.question_answering import RAGQuestionAnswering


@pytest.mark.asyncio
async def test_rag_qa_search_and_answer():
    pipeline = AsyncMock()
    generator = AsyncMock()

    documents = [
        {
            "source": "manual.pdf",
            "page": 3,
            "text": "Python is used for AI.",
            "score": 0.95,
        }
    ]

    pipeline.search.return_value = documents
    generator.generate_answer.return_value = {
        "answer": "Python is used for AI [1].",
        "sources": [
            {"id": 1, "source": "manual.pdf", "page": 3}
        ],
    }

    qa = RAGQuestionAnswering(
        pipeline=pipeline,
        answer_generator=generator,
    )

    result = await qa.ask("What is Python?", top_k=3)

    pipeline.search.assert_awaited_once_with(
        "What is Python?",
        top_k=3,
    )
    generator.generate_answer.assert_awaited_once_with(
        "What is Python?",
        documents,
    )

    assert result["answer"] == "Python is used for AI [1]."
    assert result["sources"][0]["page"] == 3


@pytest.mark.asyncio
async def test_rag_qa_no_documents():
    pipeline = AsyncMock()
    generator = AsyncMock()

    pipeline.search.return_value = []
    generator.generate_answer.return_value = {
        "answer": "No relevant information found.",
        "sources": [],
    }

    qa = RAGQuestionAnswering(
        pipeline=pipeline,
        answer_generator=generator,
    )

    result = await qa.ask("Unknown topic")

    assert result["sources"] == []
    generator.generate_answer.assert_awaited_once_with(
        "Unknown topic",
        [],
    )


@pytest.mark.asyncio
async def test_rag_qa_rejects_empty_question():
    pipeline = AsyncMock()
    generator = AsyncMock()

    qa = RAGQuestionAnswering(
        pipeline=pipeline,
        answer_generator=generator,
    )

    with pytest.raises(ValueError):
        await qa.ask("   ")

    pipeline.search.assert_not_awaited()
    generator.generate_answer.assert_not_awaited()


@pytest.mark.asyncio
async def test_rag_qa_rejects_invalid_top_k():
    pipeline = AsyncMock()
    generator = AsyncMock()

    qa = RAGQuestionAnswering(
        pipeline=pipeline,
        answer_generator=generator,
    )

    with pytest.raises(ValueError):
        await qa.ask("What is RAG?", top_k=0)

    pipeline.search.assert_not_awaited()
