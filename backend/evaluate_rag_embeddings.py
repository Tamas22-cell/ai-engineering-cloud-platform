"""Measure semantic retrieval using the configured real embedding provider.

Run from the backend directory, or inside the backend container:
    python evaluate_rag_embeddings.py
"""
import argparse
import asyncio
import json
from pathlib import Path

import numpy as np

from core.config import settings
from rag.embedding_service import EmbeddingService


DATASET_PATH = Path(__file__).parent / "rag" / "evaluation_dataset.json"


def score_retrieval(
    retrieved_ids: list[str],
    relevant_ids: set[str],
    top_k: int,
) -> dict[str, float]:
    """Return per-query Recall@k and reciprocal rank within the top-k window."""
    if top_k < 1:
        raise ValueError("top_k must be positive")
    if not relevant_ids:
        raise ValueError("Each evaluation query needs at least one relevant passage")

    ranked = retrieved_ids[:top_k]
    relevant_hits = sum(passage_id in relevant_ids for passage_id in ranked)
    first_relevant_rank = next(
        (rank for rank, passage_id in enumerate(ranked, start=1)
         if passage_id in relevant_ids),
        None,
    )
    return {
        "recall_at_k": relevant_hits / len(relevant_ids),
        "reciprocal_rank_at_k": 1 / first_relevant_rank if first_relevant_rank else 0.0,
    }


async def evaluate(top_k_override: int | None = None) -> dict:
    dataset = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    top_k = top_k_override or dataset["top_k"]
    passages = dataset["passages"]
    queries = dataset["queries"]
    passage_ids = [passage["id"] for passage in passages]
    id_set = set(passage_ids)

    for query in queries:
        missing_ids = set(query["relevant_passage_ids"]) - id_set
        if missing_ids:
            raise ValueError(f"Unknown relevant passage IDs: {sorted(missing_ids)}")

    service = EmbeddingService()
    texts = [passage["text"] for passage in passages]
    texts.extend(query["question"] for query in queries)
    vectors = np.asarray(await service.embed_texts(texts), dtype=float)
    if vectors.ndim != 2 or vectors.shape[0] != len(texts):
        raise ValueError("Embedding provider returned an invalid vector matrix")
    if not np.isfinite(vectors).all():
        raise ValueError("Embedding provider returned non-finite values")

    corpus_vectors = vectors[:len(passages)]
    query_vectors = vectors[len(passages):]
    corpus_norms = np.linalg.norm(corpus_vectors, axis=1)
    if np.any(corpus_norms == 0):
        raise ValueError("Embedding provider returned a zero passage vector")

    results = []
    for query, query_vector in zip(queries, query_vectors, strict=True):
        query_norm = np.linalg.norm(query_vector)
        if query_norm == 0:
            raise ValueError("Embedding provider returned a zero query vector")

        similarities = corpus_vectors @ query_vector / (corpus_norms * query_norm)
        order = np.argsort(-similarities, kind="stable")[:top_k]
        retrieved_ids = [passage_ids[int(index)] for index in order]
        relevant_ids = set(query["relevant_passage_ids"])
        scores = score_retrieval(retrieved_ids, relevant_ids, top_k)
        results.append({
            "question": query["question"],
            "relevant_passage_ids": sorted(relevant_ids),
            "retrieved_passage_ids": retrieved_ids,
            **scores,
        })

    recall = sum(item["recall_at_k"] for item in results) / len(results)
    mrr = sum(item["reciprocal_rank_at_k"] for item in results) / len(results)
    model = (
        settings.ollama_embedding_model
        if service.provider == "ollama"
        else "text-embedding-3-small"
    )

    return {
        "dataset": dataset["dataset"],
        "embedding_provider": service.provider,
        "embedding_model": model,
        "embedding_dimensions": int(vectors.shape[1]),
        "query_count": len(queries),
        "top_k": top_k,
        "recall_at_k": round(recall, 4),
        "mrr_at_k": round(mrr, 4),
        "results": results,
        "note": (
            "Scores measure this labeled benchmark with the configured provider; "
            "they are not a guarantee for every user document."
        ),
    }


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--top-k", type=int, help="Override the dataset top-k value")
    args = parser.parse_args()
    if args.top_k is not None and args.top_k < 1:
        parser.error("--top-k must be positive")

    result = await evaluate(args.top_k)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
