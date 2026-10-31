from openai import AsyncOpenAI


class EmbeddingService:
    def __init__(self, client: AsyncOpenAI | None = None):
        self.client = client if client is not None else AsyncOpenAI(max_retries=2, timeout=20.0)

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        if any(not isinstance(text, str) or not text.strip() for text in texts):
            raise ValueError("Embedding input must contain non-empty strings")

        response = await self.client.embeddings.create(
            model="text-embedding-3-small",
            input=texts,
        )

        if len(response.data) != len(texts):
            raise ValueError("Unexpected number of embeddings returned")

        return [
            item.embedding
            for item in sorted(response.data, key=lambda item: item.index)
        ]
