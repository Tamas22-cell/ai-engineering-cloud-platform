from unittest.mock import AsyncMock, patch

import pytest

from rag.pipeline import RAGPipeline


@pytest.mark.asyncio
async def test_rag_pipeline_index_and_search():
    embedding_service = AsyncMock()

    embedding_service.embed_texts.side_effect = [
        [[1.0, 0.0], [0.0, 1.0]],
        [[1.0, 0.0]],
    ]

    pipeline = RAGPipeline(embedding_service=embedding_service)

    chunks = [
        {"source": "manual.pdf", "page": 1, "text": "Python AI"},
        {"source": "manual.pdf", "page": 2, "text": "Database"},
    ]

    with patch("rag.pipeline.process_pdf", return_value=chunks):
        count = await pipeline.index_pdf("manual.pdf")

    assert count == 2

    results = await pipeline.search("Python", top_k=1)

    assert len(results) == 1
    assert results[0]["page"] == 1
    assert results[0]["source"] == "manual.pdf"
    assert results[0]["score"] == pytest.approx(1.0)


@pytest.mark.asyncio
async def test_rag_pipeline_empty_pdf():
    embedding_service = AsyncMock()
    pipeline = RAGPipeline(embedding_service=embedding_service)

    with patch("rag.pipeline.process_pdf", return_value=[]):
        count = await pipeline.index_pdf("empty.pdf")

    assert count == 0
    embedding_service.embed_texts.assert_not_awaited()


@pytest.mark.asyncio
async def test_rag_pipeline_rejects_empty_question():
    embedding_service = AsyncMock()
    pipeline = RAGPipeline(embedding_service=embedding_service)

    with pytest.raises(ValueError):
        await pipeline.search("   ")

    embedding_service.embed_texts.assert_not_awaited()


@pytest.mark.asyncio
async def test_rag_pipeline_search_ranking():
    embedding_service = AsyncMock()

    embedding_service.embed_texts.side_effect = [
        [[1.0, 0.0], [0.0, 1.0], [0.8, 0.6]],
        [[1.0, 0.0]],
    ]

    pipeline = RAGPipeline(embedding_service=embedding_service)

    chunks = [
        {"source": "test.pdf", "page": 1, "text": "Python"},
        {"source": "test.pdf", "page": 2, "text": "SQL"},
        {"source": "test.pdf", "page": 3, "text": "Machine learning"},
    ]

    with patch("rag.pipeline.process_pdf", return_value=chunks):
        await pipeline.index_pdf("test.pdf")

    results = await pipeline.search("AI", top_k=2)

    assert [result["page"] for result in results] == [1, 3]
