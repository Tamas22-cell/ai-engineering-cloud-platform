from rag.document_processor import process_pdf
from rag.embedding_service import EmbeddingService
from rag.semantic_search import SemanticSearch


class RAGPipeline:
    def __init__(self, embedding_service=None):
        self.embedding_service = embedding_service or EmbeddingService()
        self.search_engine = SemanticSearch()

    async def index_pdf(self, file_path: str) -> int:
        chunks = process_pdf(file_path)

        if not chunks:
            return 0

        vectors = await self.embedding_service.embed_texts(
            [chunk["text"] for chunk in chunks]
        )

        self.search_engine.add_documents(chunks, vectors)
        return len(chunks)

    async def search(self, question: str, top_k: int = 5) -> list[dict]:
        if not question or not question.strip():
            raise ValueError("Question cannot be empty")

        query_vectors = await self.embedding_service.embed_texts([question])

        return self.search_engine.search(
            query_vectors[0],
            top_k=top_k,
        )
