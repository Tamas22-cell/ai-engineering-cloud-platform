from unittest.mock import AsyncMock, patch

import pytest

from agents.gpt_tool_agent import TOOLS, TOOL_DEFINITIONS, run_gpt_tool_agent
from agents.tools.calculator import multiply_numbers


def test_multiply_numbers_tool_returns_product():
    assert multiply_numbers.invoke({"a": 1847, "b": 29}) == 53563


def test_multiply_numbers_is_registered_for_openai_and_langgraph():
    assert any(tool.name == "multiply_numbers" for tool in TOOLS)
    definition = next(item for item in TOOL_DEFINITIONS if item["name"] == "multiply_numbers")
    assert definition["parameters"]["required"] == ["a", "b"]


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
