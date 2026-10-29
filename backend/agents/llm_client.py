from openai import AsyncOpenAI

from core.config import settings


def create_llm_client() -> AsyncOpenAI:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")

    return AsyncOpenAI(
        api_key=settings.openai_api_key,
        timeout=30.0,
        max_retries=1,
    )


async def generate_response(message: str) -> str:
    client = create_llm_client()

    response = await client.responses.create(
        model="gpt-4.1-mini",
        instructions="You are a helpful AI engineering assistant.",
        input=message,
        max_output_tokens=300,
    )

    return response.output_text
