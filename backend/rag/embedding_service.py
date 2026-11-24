import math

import httpx
from openai import AsyncOpenAI

from core.config import settings


PGVECTOR_DIMENSIONS = 1536


class EmbeddingService:
    def __init__(self, client: AsyncOpenAI | None = None):
        self.client = client
        self.provider = "openai" if client is not None else settings.embedding_provider.lower()

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        if any(not isinstance(text, str) or not text.strip() for text in texts):
            raise ValueError("Embedding input must contain non-empty strings")

        if self.provider == "ollama":
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{settings.ollama_base_url.rstrip('/')}/api/embed",
                    json={
                        "model": settings.ollama_embedding_model,
                        "input": texts,
                    },
                )
                response.raise_for_status()
                payload = response.json()
            vectors = payload.get("embeddings")
            if not isinstance(vectors, list) or len(vectors) != len(texts):
                raise ValueError("Unexpected number of Ollama embeddings")

            normalized = []
            for vector in vectors:
                if not isinstance(vector, list) or not vector:
                    raise ValueError("Invalid Ollama embedding")
                if len(vector) > PGVECTOR_DIMENSIONS:
                    raise ValueError("Ollama embedding exceeds pgvector dimensions")
                numeric = [float(value) for value in vector]
                if not all(math.isfinite(value) for value in numeric):
                    raise ValueError("Ollama embedding contains invalid numbers")
                # Keep compatibility with the existing vector(1536) column.
                # Zero-padding preserves cosine similarity for equal-sized vectors.
                normalized.append(numeric + [0.0] * (PGVECTOR_DIMENSIONS - len(numeric)))
            return normalized

        if self.provider != "openai":
            raise ValueError("Unsupported embedding provider")
        api_key = settings.openai_api_key
        if not api_key and self.client is None:
            raise RuntimeError("OPENAI_API_KEY is required for OpenAI embeddings")
        client = self.client or AsyncOpenAI(api_key=api_key, max_retries=2, timeout=20.0)
        response = await client.embeddings.create(
            model="text-embedding-3-small",
            input=texts,
        )

        if len(response.data) != len(texts):
            raise ValueError("Unexpected number of embeddings returned")

        vectors = [
            item.embedding
            for item in sorted(response.data, key=lambda item: item.index)
        ]
        if any(len(vector) != PGVECTOR_DIMENSIONS for vector in vectors):
            raise ValueError("Unexpected embedding dimensions")
        return vectors
