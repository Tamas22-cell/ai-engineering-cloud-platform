from unittest.mock import AsyncMock, MagicMock

import pytest

from rag.embedding_service import EmbeddingService


@pytest.mark.asyncio
async def test_embedding_returns_vectors():
    client = MagicMock()
    client.embeddings.create = AsyncMock()

    response = MagicMock()
    response.data = [
        MagicMock(index=1, embedding=[0.3, 0.4]),
        MagicMock(index=0, embedding=[0.1, 0.2]),
    ]
    client.embeddings.create.return_value = response

    service = EmbeddingService(client=client)
    vectors = await service.embed_texts(["Python", "LangGraph"])

    assert vectors == [[0.1, 0.2], [0.3, 0.4]]

    client.embeddings.create.assert_awaited_once_with(
        model="text-embedding-3-small",
        input=["Python", "LangGraph"],
    )


@pytest.mark.asyncio
async def test_embedding_empty_input():
    client = MagicMock()
    client.embeddings.create = AsyncMock()

    service = EmbeddingService(client=client)

    assert await service.embed_texts([]) == []
    client.embeddings.create.assert_not_awaited()


@pytest.mark.asyncio
async def test_embedding_rejects_blank_text():
    service = EmbeddingService(client=MagicMock())

    with pytest.raises(ValueError):
        await service.embed_texts(["Python", " "])


@pytest.mark.asyncio
async def test_embedding_rejects_wrong_vector_count():
    client = MagicMock()
    client.embeddings.create = AsyncMock()

    response = MagicMock()
    response.data = [MagicMock(index=0, embedding=[0.1, 0.2])]
    client.embeddings.create.return_value = response

    service = EmbeddingService(client=client)

    with pytest.raises(ValueError):
        await service.embed_texts(["Python", "LangGraph"])
