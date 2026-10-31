"""Multi-agent RAG workflow: plan, retrieve, synthesize, verify.

The caller supplies an authenticated user's database session. Retrieval is always
scoped to that user; documents are treated as data, never instructions.
"""
import re
from typing import TypedDict

from langgraph.graph import StateGraph, START, END

from rag.embedding_service import EmbeddingService
from rag.persistent_search import search_stored_documents
from rag.answer_generator import RAGAnswerGenerator


class RAGState(TypedDict):
    question: str
    top_k: int
    query: str
    documents: list[dict]
    answer: str
    sources: list[dict]
    verified: bool


def build_multi_agent_rag(db, user_id: str, embedding_service=None, answer_generator=None):
    """Build an isolated graph for one authenticated request."""
    if not user_id:
        raise ValueError("Authenticated user_id is required")

    embeddings = embedding_service or EmbeddingService()
    generator = answer_generator or RAGAnswerGenerator()

    async def planner(state: RAGState):
        # Deterministic query planning avoids unnecessary LLM calls and hallucinated queries.
        query = state["question"].strip()
        if not query:
            raise ValueError("Question cannot be empty")
        return {"query": query}

    async def retriever(state: RAGState):
        vectors = await embeddings.embed_texts([state["query"]])
        if len(vectors) != 1:
            raise ValueError("Expected exactly one query embedding")
        docs = await search_stored_documents(
            db=db,
            user_id=user_id,
            query_embedding=vectors[0],
            top_k=state["top_k"],
        )
        return {"documents": docs}

    async def synthesizer(state: RAGState):
        result = await generator.generate_answer(state["question"], state["documents"])
        return {"answer": result["answer"], "sources": result["sources"]}

    async def reviewer(state: RAGState):
        # Reject invented source IDs; an unsupported answer cannot be marked verified.
        valid = {str(source["id"]) for source in state["sources"]}
        cited = set(re.findall(r"\[(\d+)\]", state["answer"]))
        if cited - valid:
            return {
                "answer": "A válasz nem ellenőrizhető a rendelkezésre álló forrásokból.",
                "verified": False,
            }
        if state["documents"] and not cited:
            return {"verified": False}
        return {"verified": bool(state["documents"] and cited)}

    graph = StateGraph(RAGState)
    graph.add_node("planner", planner)
    graph.add_node("retriever", retriever)
    graph.add_node("synthesizer", synthesizer)
    graph.add_node("reviewer", reviewer)
    graph.add_edge(START, "planner")
    graph.add_edge("planner", "retriever")
    graph.add_edge("retriever", "synthesizer")
    graph.add_edge("synthesizer", "reviewer")
    graph.add_edge("reviewer", END)
    return graph.compile()


async def run_multi_agent_rag(
    db, user_id: str, question: str, top_k: int = 5,
    embedding_service=None, answer_generator=None,
):
    if not 1 <= top_k <= 20:
        raise ValueError("top_k must be between 1 and 20")
    graph = build_multi_agent_rag(db, user_id, embedding_service, answer_generator)
    result = await graph.ainvoke({
        "question": question,
        "top_k": top_k,
        "query": "",
        "documents": [],
        "answer": "",
        "sources": [],
        "verified": False,
    })
    return {
        "answer": result["answer"],
        "sources": result["sources"],
        "verified": result["verified"],
    }
