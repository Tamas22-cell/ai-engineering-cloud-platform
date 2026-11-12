from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from rag.semantic_reviewer import verify_answer_support


@pytest.mark.asyncio
async def test_semantic_reviewer_accepts_supported_claim():
    client = SimpleNamespace(responses=SimpleNamespace(create=AsyncMock(
        return_value=SimpleNamespace(output_text="SUPPORTED")
    )))
    assert await verify_answer_support(
        "A kód RAG-QUANTUM-7429 [1].",
        [{"text": "A kód RAG-QUANTUM-7429."}], client=client,
    ) is True


@pytest.mark.asyncio
async def test_semantic_reviewer_rejects_unsupported_claim():
    client = SimpleNamespace(responses=SimpleNamespace(create=AsyncMock(
        return_value=SimpleNamespace(output_text="UNSUPPORTED")
    )))
    assert await verify_answer_support(
        "A kód RAG-FAKE-9999 [1].",
        [{"text": "A kód RAG-QUANTUM-7429."}], client=client,
    ) is False


@pytest.mark.asyncio
async def test_semantic_reviewer_rejects_invalid_citation_without_api_call():
    client = SimpleNamespace(responses=SimpleNamespace(create=AsyncMock()))
    assert await verify_answer_support("Tény [99].", [{"text": "Tény"}], client=client) is False
    client.responses.create.assert_not_awaited()


@pytest.mark.asyncio
async def test_semantic_reviewer_recovers_supported_paraphrase():
    client = SimpleNamespace(responses=SimpleNamespace(create=AsyncMock(
        side_effect=[
            SimpleNamespace(output_text="UNSUPPORTED"),
            SimpleNamespace(output_text="SUPPORTED"),
        ],
    )))
    assert await verify_answer_support(
        "The login endpoint returns an access token [1].",
        [{"text": "POST /auth/login: access_token in successful response."}],
        client=client,
    ) is True
    assert client.responses.create.await_count == 2


@pytest.mark.asyncio
async def test_semantic_reviewer_rejects_twice_unsupported_claim():
    client = SimpleNamespace(responses=SimpleNamespace(create=AsyncMock(
        side_effect=[
            SimpleNamespace(output_text="UNSUPPORTED"),
            SimpleNamespace(output_text="UNSUPPORTED"),
        ],
    )))
    assert await verify_answer_support(
        "Invented capability [1].", [{"text": "Only login is documented."}],
        client=client,
    ) is False


@pytest.mark.asyncio
async def test_semantic_reviewer_rejects_ambiguous_first_verdict():
    client = SimpleNamespace(responses=SimpleNamespace(create=AsyncMock(
        return_value=SimpleNamespace(output_text="Maybe supported"),
    )))
    assert await verify_answer_support(
        "A claim [1].", [{"text": "Evidence."}], client=client,
    ) is False
    client.responses.create.assert_awaited_once()
