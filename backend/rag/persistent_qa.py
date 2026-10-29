from rag.embedding_service import EmbeddingService
from rag.persistent_search import search_stored_documents
from rag.answer_generator import RAGAnswerGenerator


class PersistentRAGQuestionAnswering:
    def __init__(
        self,
        embedding_service=None,
        answer_generator=None,
    ):
        self.embedding_service = (
            embedding_service
            if embedding_service is not None
            else EmbeddingService()
        )
        self.answer_generator = (
            answer_generator
            if answer_generator is not None
            else RAGAnswerGenerator()
        )

    async def ask(
        self,
        db,
        user_id: str,
        question: str,
        top_k: int = 5,
    ) -> dict:
        if not isinstance(question, str) or not question.strip():
            raise ValueError("Question cannot be empty")

        if not 1 <= top_k <= 20:
            raise ValueError("top_k must be between 1 and 20")

        vectors = await self.embedding_service.embed_texts(
            [question]
        )

        if len(vectors) != 1:
            raise ValueError("Invalid query embedding response")

        documents = await search_stored_documents(
            db=db,
            user_id=user_id,
            query_embedding=vectors[0],
            top_k=top_k,
        )

        return await self.answer_generator.generate_answer(
            question,
            documents,
        )
