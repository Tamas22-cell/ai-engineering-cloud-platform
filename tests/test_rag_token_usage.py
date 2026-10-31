from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from rag.answer_generator import RAGAnswerGenerator


@pytest.mark.asyncio
async def test_generator_reports_actual_token_usage():
    client = SimpleNamespace(responses=SimpleNamespace(create=AsyncMock()))
    client.responses.create.return_value = SimpleNamespace(
        output_text="Válasz [1].",
        usage=SimpleNamespace(input_tokens=120, output_tokens=30),
    )
    result = await RAGAnswerGenerator(client=client).generate_answer(
        "Kérdés", [{"source": "test.pdf", "page": 1, "text": "Tény"}]
    )
    assert result["usage"] == {
        "model": "gpt-4.1-mini",
        "input_tokens": 120,
        "output_tokens": 30,
        "total_tokens": 150,
    }


@pytest.mark.asyncio
async def test_generator_handles_missing_usage_metadata():
    client = SimpleNamespace(responses=SimpleNamespace(create=AsyncMock()))
    client.responses.create.return_value = SimpleNamespace(output_text="Válasz [1].")
    result = await RAGAnswerGenerator(client=client).generate_answer(
        "Kérdés", [{"source": "test.pdf", "page": 1, "text": "Tény"}]
    )
    assert result["usage"]["total_tokens"] == 0


@pytest.mark.asyncio
async def test_generator_calculates_configured_cost(monkeypatch):
    monkeypatch.setenv("OPENAI_INPUT_USD_PER_1M", "1.25")
    monkeypatch.setenv("OPENAI_OUTPUT_USD_PER_1M", "5")
    client = SimpleNamespace(responses=SimpleNamespace(create=AsyncMock()))
    client.responses.create.return_value = SimpleNamespace(
        output_text="Válasz [1].",
        usage=SimpleNamespace(input_tokens=1000000, output_tokens=200000),
    )
    result = await RAGAnswerGenerator(client=client).generate_answer(
        "Kérdés", [{"source": "test.pdf", "page": 1, "text": "Tény"}]
    )
    assert result["usage"]["estimated_cost_usd"] == "2.25"


@pytest.mark.asyncio
async def test_generator_omits_cost_without_configured_prices(monkeypatch):
    monkeypatch.delenv("OPENAI_INPUT_USD_PER_1M", raising=False)
    monkeypatch.delenv("OPENAI_OUTPUT_USD_PER_1M", raising=False)
    client = SimpleNamespace(responses=SimpleNamespace(create=AsyncMock()))
    client.responses.create.return_value = SimpleNamespace(
        output_text="Válasz [1].",
        usage=SimpleNamespace(input_tokens=10, output_tokens=5),
    )
    result = await RAGAnswerGenerator(client=client).generate_answer(
        "Kérdés", [{"source": "test.pdf", "page": 1, "text": "Tény"}]
    )
    assert result["usage"]["estimated_cost_usd"] is None
