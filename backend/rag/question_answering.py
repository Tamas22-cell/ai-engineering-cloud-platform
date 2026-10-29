from rag.answer_generator import RAGAnswerGenerator
from rag.pipeline import RAGPipeline


class RAGQuestionAnswering:
    def __init__(self, pipeline=None, answer_generator=None):
        self.pipeline = (
            pipeline if pipeline is not None else RAGPipeline()
        )
        self.answer_generator = (
            answer_generator
            if answer_generator is not None
            else RAGAnswerGenerator()
        )

    async def ask(self, question: str, top_k: int = 5) -> dict:
        if not isinstance(question, str) or not question.strip():
            raise ValueError("Question cannot be empty")

        if top_k <= 0:
            raise ValueError("top_k must be positive")

        documents = await self.pipeline.search(
            question,
            top_k=top_k,
        )

        return await self.answer_generator.generate_answer(
            question,
            documents,
        )
