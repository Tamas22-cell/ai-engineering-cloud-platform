from unittest.mock import AsyncMock

import pytest

from rag import multi_agent


@pytest.mark.asyncio
async def test_multi_agent_rag_cites_scoped_documents(monkeypatch):
    embedding = AsyncMock()
    embedding.embed_texts.return_value = [[1.0, 0.0]]
    generator = AsyncMock()
    generator.generate_answer.return_value = {
        "answer": "A válasz a dokumentumban szerepel [1].",
        "sources": [{"id": 1, "source": "test.pdf", "page": 2}],
    }
    search = AsyncMock(return_value=[
        {"source": "test.pdf", "page": 2, "text": "Tény"}
    ])
    monkeypatch.setattr(multi_agent, "search_stored_documents", search)
    db = object()
    result = await multi_agent.run_multi_agent_rag(
        db, "user-123", "Mi a válasz?", embedding_service=embedding,
        answer_generator=generator,
    )
    assert result["verified"] is True
    assert result["sources"][0]["page"] == 2
    assert search.await_args.kwargs["user_id"] == "user-123"
    assert search.await_args.kwargs["db"] is db


@pytest.mark.asyncio
async def test_multi_agent_rag_rejects_invented_citation(monkeypatch):
    embedding = AsyncMock()
    embedding.embed_texts.return_value = [[1.0]]
    generator = AsyncMock()
    generator.generate_answer.return_value = {
        "answer": "Kitalált hivatkozás [99].",
        "sources": [{"id": 1, "source": "test.pdf", "page": 1}],
    }
    monkeypatch.setattr(multi_agent, "search_stored_documents", AsyncMock(
        return_value=[{"source": "test.pdf", "page": 1, "text": "Tény"}]
    ))
    result = await multi_agent.run_multi_agent_rag(
        object(), "user-123", "Kérdés", embedding_service=embedding,
        answer_generator=generator,
    )
    assert result["verified"] is False
    assert "nem ellenőrizhető" in result["answer"]


@pytest.mark.asyncio
async def test_multi_agent_rag_empty_results(monkeypatch):
    embedding = AsyncMock()
    embedding.embed_texts.return_value = [[1.0]]
    generator = AsyncMock()
    generator.generate_answer.return_value = {
        "answer": "Nincs releváns információ.",
        "sources": [],
    }
    monkeypatch.setattr(multi_agent, "search_stored_documents", AsyncMock(return_value=[]))
    result = await multi_agent.run_multi_agent_rag(
        object(), "user-123", "Kérdés", embedding_service=embedding,
        answer_generator=generator,
    )
    assert result["verified"] is False
    assert result["sources"] == []
    generator.generate_answer.assert_not_awaited()


@pytest.mark.asyncio
async def test_multi_agent_ignores_fabricated_source_metadata(monkeypatch):
    embedding = AsyncMock()
    embedding.embed_texts.return_value = [[1.0]]
    generator = AsyncMock()
    generator.generate_answer.return_value = {
        "answer": "Az adat megtalálható [1].",
        "sources": [{"id": 1, "source": "invented.pdf", "page": 999}],
    }
    monkeypatch.setattr(
        multi_agent, "search_stored_documents",
        AsyncMock(return_value=[{
            "source": "real.pdf", "page": 3, "text": "Az adat"
        }]),
    )
    result = await multi_agent.run_multi_agent_rag(
        object(), "user-123", "Kérdés",
        embedding_service=embedding, answer_generator=generator,
    )
    assert result["verified"] is True
    assert result["sources"] == [
        {"id": 1, "source": "real.pdf", "page": 3}
    ]


@pytest.mark.asyncio
async def test_multi_agent_uncited_answer_not_verified(monkeypatch):
    embedding = AsyncMock()
    embedding.embed_texts.return_value = [[1.0]]
    generator = AsyncMock()
    generator.generate_answer.return_value = {
        "answer": "Hivatkozás nélküli válasz.",
        "sources": [{"id": 1, "source": "real.pdf", "page": 3}],
    }
    monkeypatch.setattr(
        multi_agent, "search_stored_documents",
        AsyncMock(return_value=[{
            "source": "real.pdf", "page": 3, "text": "Az adat"
        }]),
    )
    result = await multi_agent.run_multi_agent_rag(
        object(), "user-123", "Kérdés",
        embedding_service=embedding, answer_generator=generator,
    )
    assert result["verified"] is False
