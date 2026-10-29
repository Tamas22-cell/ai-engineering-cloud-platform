from unittest.mock import AsyncMock, MagicMock

import pytest

from rag.answer_generator import RAGAnswerGenerator


@pytest.mark.asyncio
async def test_rag_answer_with_sources():
    client = MagicMock()
    client.responses.create = AsyncMock()

    response = MagicMock()
    response.output_text = "Python supports AI development [1]."
    client.responses.create.return_value = response

    generator = RAGAnswerGenerator(client=client)

    result = await generator.generate_answer(
        "What is Python used for?",
        [{
            "source": "manual.pdf",
            "page": 3,
            "text": "Python is used for AI development.",
        }],
    )

    assert result["answer"] == "Python supports AI development [1]."
    assert result["sources"] == [
        {"id": 1, "source": "manual.pdf", "page": 3}
    ]

    client.responses.create.assert_awaited_once()

    call = client.responses.create.await_args.kwargs
    assert call["model"] == "gpt-4.1-mini"
    assert "Python is used for AI development." in call["input"]


@pytest.mark.asyncio
async def test_rag_answer_without_documents():
    client = MagicMock()
    client.responses.create = AsyncMock()

    generator = RAGAnswerGenerator(client=client)

    result = await generator.generate_answer("What is RAG?", [])

    assert result["sources"] == []
    assert "No relevant information" in result["answer"]
    client.responses.create.assert_not_awaited()


@pytest.mark.asyncio
async def test_rag_answer_rejects_empty_question():
    client = MagicMock()
    client.responses.create = AsyncMock()

    generator = RAGAnswerGenerator(client=client)

    with pytest.raises(ValueError):
        await generator.generate_answer("   ", [])

    client.responses.create.assert_not_awaited()


@pytest.mark.asyncio
async def test_rag_answer_multiple_sources():
    client = MagicMock()
    client.responses.create = AsyncMock()
    client.responses.create.return_value = MagicMock(
        output_text="Answer based on two sources [1] [2]."
    )

    generator = RAGAnswerGenerator(client=client)

    result = await generator.generate_answer(
        "Explain RAG",
        [
            {"source": "first.pdf", "page": 1, "text": "Retrieval"},
            {"source": "second.pdf", "page": 5, "text": "Generation"},
        ],
    )

    assert len(result["sources"]) == 2
    assert result["sources"][0]["page"] == 1
    assert result["sources"][1]["page"] == 5
    assert "[1]" in result["answer"]
    assert "[2]" in result["answer"]
