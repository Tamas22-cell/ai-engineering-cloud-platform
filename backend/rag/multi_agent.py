"""Multi-agent RAG workflow: plan, retrieve, synthesize, verify.

The caller supplies an authenticated user's database session. Retrieval is always
scoped to that user; documents are treated as data, never instructions.
"""
import asyncio
import os
import re
import time
from typing import TypedDict

from langgraph.graph import StateGraph, START, END
from opentelemetry import trace
import structlog

from rag.embedding_service import EmbeddingService
from rag.persistent_search import search_stored_documents
from rag.answer_generator import RAGAnswerGenerator
from rag.semantic_reviewer import verify_answer_support

logger = structlog.get_logger(__name__)


class RAGState(TypedDict):
    question: str
    top_k: int
    query: str
    documents: list[dict]
    answer: str
    sources: list[dict]
    verified: bool
    usage: dict
    step_timings_ms: dict


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
        # No source evidence: do not spend tokens or invite an ungrounded answer.
        if not state["documents"]:
            return {
                "answer": "A feltöltött dokumentumokban nem található releváns információ.",
                "sources": [],
                "usage": {},
            }
        result = await generator.generate_answer(state["question"], state["documents"])
        return {"answer": result["answer"], "sources": result["sources"], "usage": result.get("usage", {})}

    async def reviewer(state: RAGState):
        # The generator's source metadata is untrusted: reconstruct it from
        # the retrieved, user-scoped documents before accepting citations.
        documents = state["documents"]
        trusted_sources = [
            {
                "id": index,
                "source": str(doc.get("source", "unknown")),
                "page": doc.get("page", "?"),
            }
            for index, doc in enumerate(documents, start=1)
        ]
        valid = {str(source["id"]) for source in trusted_sources}
        cited = set(re.findall(r"\[(\d+)\]", state["answer"]))
        verified = bool(documents and cited and cited.issubset(valid))
        # Ground exact identifiers in the cited excerpts, not unrelated pages.
        identifiers = set(re.findall(
        
            r"(?<![\w-])[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+(?![\w-])",
            state["answer"],
        ))
        cited_evidence = "\n".join(
            str(documents[int(ref) - 1].get("text", ""))
            for ref in cited if ref in valid
        )
        if verified and any(identifier not in cited_evidence for identifier in identifiers):
            return {
                "answer": "A válaszban szereplő azonosító nem található a hivatkozott dokumentumrészekben.",
                "sources": trusted_sources,
                "verified": False,
            }
        if cited - valid:
            return {
                "answer": "A válasz nem ellenőrizhető a rendelkezésre álló forrásokból.",
                "sources": trusted_sources,
                "verified": False,
            }
        if documents and not cited:
            return {
                "answer": "A válasz nem tartalmaz ellenőrizhető forráshivatkozást.",
                "sources": trusted_sources,
                "verified": False,
            }
        if verified and os.getenv("RAG_SEMANTIC_REVIEW_ENABLED", "false").lower() == "true":
            try:
                verified = await verify_answer_support(state["answer"], documents)
                if not verified:
                    logger.warning("rag_semantic_review_rejected")
            except Exception as exc:
                # Do not log document content, answers, API keys, or raw exceptions.
                logger.warning("rag_semantic_review_error", error_type=type(exc).__name__)
                verified = False  # Fail closed on timeout, API errors or ambiguous verdicts.
        return {"sources": trusted_sources, "verified": verified}

    def instrument(name, node):
        async def timed(state):
            started = time.perf_counter()
            with trace.get_tracer('ai-engineering.rag').start_as_current_span(f'rag.{name}') as span:
                try:
                    result = await node(state)
                    span.set_attribute('rag.step.success', True)
                    return {**result, 'step_timings_ms': {**state.get('step_timings_ms', {}), name: round((time.perf_counter() - started) * 1000, 2)}}
                except Exception:
                    span.set_attribute('rag.step.success', False)
                    raise
        return timed

    graph = StateGraph(RAGState)
    graph.add_node("planner", instrument("planner", planner))
    graph.add_node("retriever", instrument("retriever", retriever))
    graph.add_node("synthesizer", instrument("synthesizer", synthesizer))
    graph.add_node("reviewer", instrument("reviewer", reviewer))
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
    if not isinstance(question, str) or not question.strip():
        raise ValueError("Question cannot be empty")
    graph = build_multi_agent_rag(db, user_id, embedding_service, answer_generator)
    with trace.get_tracer("ai-engineering.rag").start_as_current_span("rag.multi_agent") as span:
        span.set_attribute("rag.top_k", top_k)
        result = await asyncio.wait_for(graph.ainvoke({
        "question": question,
        "top_k": top_k,
        "query": "",
        "documents": [],
        "answer": "",
        "sources": [],
        "verified": False,
        "usage": {},
        "step_timings_ms": {},
        }), timeout=60)
        span.set_attribute("rag.verified", bool(result["verified"]))
        span.set_attribute("rag.total_tokens", int(result.get("usage", {}).get("total_tokens", 0)))
    return {
        "answer": result["answer"],
        "sources": result["sources"],
        "verified": result["verified"],
        "usage": result.get("usage", {}),
        "step_timings_ms": result.get("step_timings_ms", {}),
    }
