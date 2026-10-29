from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from langchain_core.messages import HumanMessage, ToolMessage

from agents.gpt_tool_agent import gpt_tool_agent


@pytest.mark.asyncio
async def test_gpt_calculator_tool_call():
    tool_response = SimpleNamespace(
        output=[
            SimpleNamespace(
                type="function_call",
                name="add_numbers",
                arguments='{"a": 15, "b": 27}',
                call_id="call-test-1",
            )
        ]
    )

    final_response = SimpleNamespace(
        output=[
            SimpleNamespace(
                type="message",
                content=[
                    SimpleNamespace(
                        type="output_text",
                        text="15 + 27 = 42",
                    )
                ],
            )
        ]
    )

    client = SimpleNamespace(
        responses=SimpleNamespace(
            create=AsyncMock(
                side_effect=[tool_response, final_response]
            )
        )
    )

    with patch(
        "agents.gpt_tool_agent.create_llm_client",
        return_value=client,
    ):
        result = await gpt_tool_agent.ainvoke({
            "messages": [
                HumanMessage(content="What is 15 + 27?")
            ]
        })

    tool_messages = [
        message for message in result["messages"]
        if isinstance(message, ToolMessage)
    ]

    assert len(tool_messages) == 1
    assert tool_messages[0].content == "42.0"
    assert result["messages"][-1].content == "15 + 27 = 42"
    assert client.responses.create.await_count == 2
