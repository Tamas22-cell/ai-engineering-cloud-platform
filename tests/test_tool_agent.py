import pytest
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage

from agents.tool_agent import tool_agent


@pytest.mark.asyncio
async def test_tool_agent_calculation():
    result = await tool_agent.ainvoke({
        "messages": [HumanMessage(content="Calculate 12 + 8")]
    })

    messages = result["messages"]

    assert any(isinstance(m, ToolMessage) for m in messages)
    assert isinstance(messages[-1], AIMessage)
    assert messages[-1].content == "Calculation result: 20.0"


@pytest.mark.asyncio
async def test_tool_agent_calls_calculator():
    result = await tool_agent.ainvoke({
        "messages": [HumanMessage(content="Add two numbers")]
    })

    tool_messages = [
        m for m in result["messages"]
        if isinstance(m, ToolMessage)
    ]

    assert len(tool_messages) == 1
    assert tool_messages[0].name == "add_numbers"
    assert tool_messages[0].content == "20.0"
