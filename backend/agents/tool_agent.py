from langgraph.prebuilt import ToolNode
from langgraph.graph import StateGraph, START, END, MessagesState
from langchain_core.messages import AIMessage, ToolMessage

from agents.tools.calculator import add_numbers


tools = [add_numbers]
tool_node = ToolNode(tools)


async def agent_node(state: MessagesState):
    """Demonstrate tool invocation without a paid LLM call."""
    last_message = state["messages"][-1]

    if isinstance(last_message, ToolMessage):
        return {
            "messages": [
                AIMessage(content=f"Calculation result: {last_message.content}")
            ]
        }

    return {
        "messages": [
            AIMessage(
                content="",
                tool_calls=[{
                    "name": "add_numbers",
                    "args": {"a": 12, "b": 8},
                    "id": "calculator-test-1",
                    "type": "tool_call",
                }],
            )
        ]
    }


def route_tools(state: MessagesState):
    last_message = state["messages"][-1]
    return "tools" if getattr(last_message, "tool_calls", None) else END


graph = StateGraph(MessagesState)
graph.add_node("agent", agent_node)
graph.add_node("tools", tool_node)
graph.add_edge(START, "agent")
graph.add_conditional_edges("agent", route_tools)
graph.add_edge("tools", "agent")

tool_agent = graph.compile()
