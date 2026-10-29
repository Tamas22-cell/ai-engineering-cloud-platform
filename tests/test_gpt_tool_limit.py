import pytest

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.errors import GraphRecursionError
from langgraph.graph import StateGraph, START, END, MessagesState


@pytest.mark.asyncio
async def test_gpt_tool_agent_recursion_limit():
    async def endless_agent(state: MessagesState):
        return {
            "messages": [
                AIMessage(content="Continue processing")
            ]
        }

    graph = StateGraph(MessagesState)
    graph.add_node("agent", endless_agent)
    graph.add_edge(START, "agent")
    graph.add_edge("agent", "agent")

    test_agent = graph.compile()

    with pytest.raises(GraphRecursionError):
        await test_agent.ainvoke(
            {"messages": [HumanMessage(content="Test")]},
            config={"recursion_limit": 4},
        )
