from typing import TypedDict

from langgraph.graph import StateGraph, START, END

from agents.llm_client import generate_response


class LLMAgentState(TypedDict):
    message: str
    response: str


async def call_llm(state: LLMAgentState) -> dict:
    answer = await generate_response(state["message"])
    return {"response": answer}


def create_llm_agent():
    graph = StateGraph(LLMAgentState)

    graph.add_node("call_llm", call_llm)
    graph.add_edge(START, "call_llm")
    graph.add_edge("call_llm", END)

    return graph.compile()


llm_agent = create_llm_agent()
