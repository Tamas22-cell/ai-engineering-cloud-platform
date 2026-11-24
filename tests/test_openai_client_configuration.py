from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from core.config import settings
from rag.answer_generator import RAGAnswerGenerator
from rag.embedding_service import EmbeddingService


@pytest.mark.asyncio
async def test_answer_generator_uses_bounded_openai_retries(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", "test-key")
    client = MagicMock()
    client.responses.create = AsyncMock(return_value=SimpleNamespace(
        output_text="Evidence supports this answer [1].",
        usage=SimpleNamespace(input_tokens=10, output_tokens=5),
    ))

    with patch("rag.answer_generator.AsyncOpenAI", return_value=client) as client_factory:
        generator = RAGAnswerGenerator()
        await generator.generate_answer(
            "What is supported?",
            [{"source": "source.pdf", "page": 1, "text": "Evidence supports this answer."}],
        )

    client_factory.assert_called_once_with(api_key="test-key", max_retries=2, timeout=20.0)
    client.responses.create.assert_awaited_once()


@pytest.mark.asyncio
async def test_embedding_service_uses_bounded_openai_retries(monkeypatch):
    monkeypatch.setattr(settings, "embedding_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", "test-key")
    client = MagicMock()
    client.embeddings.create = AsyncMock(return_value=SimpleNamespace(
        data=[SimpleNamespace(index=0, embedding=[0.1] * 1536)],
    ))

    with patch("rag.embedding_service.AsyncOpenAI", return_value=client) as client_factory:
        service = EmbeddingService()
        vectors = await service.embed_texts(["test text"])

    client_factory.assert_called_once_with(api_key="test-key", max_retries=2, timeout=20.0)
    client.embeddings.create.assert_awaited_once()
    assert len(vectors) == 1 and len(vectors[0]) == 1536


def test_injected_clients_are_preserved():
    client = object()
    assert RAGAnswerGenerator(client=client).client is client
    assert EmbeddingService(client=client).client is client
