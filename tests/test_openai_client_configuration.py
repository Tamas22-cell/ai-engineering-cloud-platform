from unittest.mock import patch

from rag.answer_generator import RAGAnswerGenerator
from rag.embedding_service import EmbeddingService


def test_answer_generator_uses_bounded_openai_retries():
    with patch("rag.answer_generator.AsyncOpenAI") as client_factory:
        generator = RAGAnswerGenerator()
    client_factory.assert_called_once_with(max_retries=2, timeout=20.0)
    assert generator.client is client_factory.return_value


def test_embedding_service_uses_bounded_openai_retries():
    with patch("rag.embedding_service.AsyncOpenAI") as client_factory:
        service = EmbeddingService()
    client_factory.assert_called_once_with(max_retries=2, timeout=20.0)
    assert service.client is client_factory.return_value


def test_injected_clients_are_preserved():
    client = object()
    assert RAGAnswerGenerator(client=client).client is client
    assert EmbeddingService(client=client).client is client
