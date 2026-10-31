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
