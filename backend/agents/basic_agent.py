from typing import TypedDict

from langgraph.graph import StateGraph, START, END


class AgentState(TypedDict):
    message: str
    response: str


def process_message(state: AgentState) -> dict:
    return {
        "response": f"AI Agent received: {state['message']}"
    }


def create_agent():
    graph = StateGraph(AgentState)
    graph.add_node("process_message", process_message)
    graph.add_edge(START, "process_message")
    graph.add_edge("process_message", END)
    return graph.compile()


agent = create_agent()
