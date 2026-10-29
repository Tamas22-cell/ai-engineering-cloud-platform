from unittest.mock import AsyncMock, patch

import pytest

from agents.llm_agent import llm_agent


@pytest.mark.asyncio
async def test_llm_agent_response():
    with patch(
        "agents.llm_agent.generate_response",
        new_callable=AsyncMock,
        return_value="Hello from GPT!",
    ) as mock_llm:
        result = await llm_agent.ainvoke({
            "message": "Hello AI",
            "response": "",
        })

    assert result["response"] == "Hello from GPT!"
    mock_llm.assert_awaited_once_with("Hello AI")


@pytest.mark.asyncio
async def test_llm_agent_empty_response():
    with patch(
        "agents.llm_agent.generate_response",
        new_callable=AsyncMock,
        return_value="",
    ):
        result = await llm_agent.ainvoke({
            "message": "Test",
            "response": "",
        })

    assert result["response"] == ""
