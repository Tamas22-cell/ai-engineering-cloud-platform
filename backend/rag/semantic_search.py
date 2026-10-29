import numpy as np


class SemanticSearch:
    def __init__(self):
        self.documents = []
        self.vectors = None

    def add_documents(self, documents: list[dict], embeddings: list[list[float]]):
        if len(documents) != len(embeddings):
            raise ValueError("Documents and embeddings count must match")

        if not documents:
            return

        vectors = np.asarray(embeddings, dtype=float)

        if vectors.ndim != 2 or vectors.shape[1] == 0:
            raise ValueError("Embeddings must be non-empty vectors")

        if not np.isfinite(vectors).all():
            raise ValueError("Embeddings must contain finite numbers")

        norms = np.linalg.norm(vectors, axis=1)

        if np.any(norms == 0):
            raise ValueError("Zero vectors are not allowed")

        normalized = vectors / norms[:, None]

        if self.vectors is not None:
            if normalized.shape[1] != self.vectors.shape[1]:
                raise ValueError("Embedding dimensions must match")

            self.vectors = np.vstack([self.vectors, normalized])
        else:
            self.vectors = normalized

        self.documents.extend(documents)

    def search(self, query_embedding: list[float], top_k: int = 5) -> list[dict]:
        if top_k <= 0:
            raise ValueError("top_k must be positive")

        if self.vectors is None:
            return []

        query = np.asarray(query_embedding, dtype=float)

        if query.ndim != 1 or query.shape[0] != self.vectors.shape[1]:
            raise ValueError("Query embedding dimensions do not match")

        if not np.isfinite(query).all():
            raise ValueError("Query embedding contains invalid numbers")

        norm = np.linalg.norm(query)

        if norm == 0:
            raise ValueError("Query embedding cannot be a zero vector")

        similarities = self.vectors @ (query / norm)
        indices = np.argsort(-similarities, kind="stable")[:top_k]

        return [
            {
                **self.documents[int(i)],
                "score": float(similarities[i]),
            }
            for i in indices
        ]
