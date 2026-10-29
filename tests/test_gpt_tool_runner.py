from unittest.mock import AsyncMock, patch

import pytest

from agents.gpt_tool_agent import run_gpt_tool_agent


@pytest.mark.asyncio
async def test_bounded_gpt_tool_agent():
    fake_result = {"messages": []}

    with patch(
        "agents.gpt_tool_agent.gpt_tool_agent.ainvoke",
        new_callable=AsyncMock,
        return_value=fake_result,
    ) as mock_invoke:
        result = await run_gpt_tool_agent("Calculate 15 + 27")

    assert result == fake_result

    mock_invoke.assert_awaited_once()

    args, kwargs = mock_invoke.await_args

    assert args[0]["messages"][0].content == "Calculate 15 + 27"
    assert kwargs["config"]["recursion_limit"] == 10
