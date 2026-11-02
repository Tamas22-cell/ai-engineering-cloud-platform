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
