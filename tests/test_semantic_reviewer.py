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


@pytest.mark.asyncio
async def test_semantic_reviewer_uses_safe_token_budget_on_both_passes():
    client = SimpleNamespace(responses=SimpleNamespace(create=AsyncMock(
        side_effect=[
            SimpleNamespace(output_text="UNSUPPORTED"),
            SimpleNamespace(output_text="SUPPORTED"),
        ],
    )))
    assert await verify_answer_support(
        "The documented endpoint returns a token [1].",
        [{"text": "The documented endpoint returns an access token."}],
        client=client,
    ) is True
    assert client.responses.create.await_count == 2
    for call in client.responses.create.await_args_list:
        assert call.kwargs["max_output_tokens"] >= 64
        assert call.kwargs["model"] == "gpt-4.1-mini"


@pytest.mark.asyncio
async def test_semantic_reviewer_propagates_provider_bad_request():
    from openai import BadRequestError
    import httpx

    request = httpx.Request("POST", "https://api.openai.com/v1/responses")
    response = httpx.Response(400, request=request)
    error = BadRequestError(
        "Invalid request", response=response,
        body={"error": {"code": "invalid_request_error"}},
    )
    client = SimpleNamespace(responses=SimpleNamespace(create=AsyncMock(side_effect=error)))
    with pytest.raises(BadRequestError):
        await verify_answer_support(
            "Documented fact [1].", [{"text": "Documented fact."}], client=client,
        )
    client.responses.create.assert_awaited_once()
