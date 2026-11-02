import structlog
from openai import AsyncOpenAI

from core.config import settings

logger = structlog.get_logger()


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

    usage = response.usage
    if usage is not None:
        logger.info("agent_llm_token_usage", model="gpt-4.1-mini",
                    input_tokens=usage.input_tokens,
                    output_tokens=usage.output_tokens,
                    total_tokens=usage.total_tokens)
    return response.output_text
