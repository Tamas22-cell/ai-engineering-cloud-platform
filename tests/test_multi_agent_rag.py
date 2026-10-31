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
    assert result["answer"] == "A válasz nem tartalmaz ellenőrizhető forráshivatkozást."


@pytest.mark.asyncio
async def test_multi_agent_rejects_blank_question_without_api_calls(monkeypatch):
    embedding = AsyncMock()
    generator = AsyncMock()
    search = AsyncMock()
    monkeypatch.setattr(multi_agent, "search_stored_documents", search)

    with pytest.raises(ValueError, match="Question cannot be empty"):
        await multi_agent.run_multi_agent_rag(
            object(), "user-123", "   ",
            embedding_service=embedding, answer_generator=generator,
        )

    embedding.embed_texts.assert_not_awaited()
    search.assert_not_awaited()
    generator.generate_answer.assert_not_awaited()


@pytest.mark.asyncio
async def test_multi_agent_times_out_and_cancels_stalled_graph(monkeypatch):
    import asyncio
    from types import SimpleNamespace

    cancelled = asyncio.Event()

    async def stalled_graph(_state):
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    monkeypatch.setattr(
        multi_agent, "build_multi_agent_rag",
        lambda *args, **kwargs: SimpleNamespace(ainvoke=stalled_graph),
    )
    original_wait_for = asyncio.wait_for

    async def fast_timeout(awaitable, timeout):
        assert timeout == 60
        return await original_wait_for(awaitable, timeout=0.01)

    monkeypatch.setattr(multi_agent.asyncio, "wait_for", fast_timeout)
    with pytest.raises(TimeoutError):
        await multi_agent.run_multi_agent_rag(object(), "user-123", "Kérdés")
    assert cancelled.is_set()


@pytest.mark.asyncio
async def test_multi_agent_propagates_token_usage(monkeypatch):
    embedding = AsyncMock()
    embedding.embed_texts.return_value = [[1.0]]
    generator = AsyncMock()
    generator.generate_answer.return_value = {
        "answer": "Tény [1].",
        "sources": [],
        "usage": {"model": "gpt-4.1-mini", "input_tokens": 12, "output_tokens": 3, "total_tokens": 15},
    }
    monkeypatch.setattr(
        multi_agent, "search_stored_documents",
        AsyncMock(return_value=[{"source": "source.pdf", "page": 1, "text": "Tény"}]),
    )
    result = await multi_agent.run_multi_agent_rag(
        object(), "user-123", "Kérdés",
        embedding_service=embedding, answer_generator=generator,
    )
    assert result["verified"] is True
    assert result["usage"]["total_tokens"] == 15


@pytest.mark.asyncio
async def test_multi_agent_empty_results_have_no_generation_usage(monkeypatch):
    embedding = AsyncMock()
    embedding.embed_texts.return_value = [[1.0]]
    generator = AsyncMock()
    monkeypatch.setattr(multi_agent, "search_stored_documents", AsyncMock(return_value=[]))
    result = await multi_agent.run_multi_agent_rag(
        object(), "user-123", "Kérdés",
        embedding_service=embedding, answer_generator=generator,
    )
    assert result["usage"] == {}
    generator.generate_answer.assert_not_awaited()
