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


def create_huggingface_client() -> AsyncOpenAI:
    if not settings.hf_token:
        raise RuntimeError("HF_TOKEN is not configured")

    return AsyncOpenAI(
        api_key=settings.hf_token,
        base_url=settings.hf_base_url.rstrip("/"),
        timeout=120.0,
        max_retries=1,
    )


async def generate_response(message: str, max_output_tokens: int = 300) -> str:
    provider = settings.llm_provider.lower()
    if provider == "ollama":
        import httpx

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{settings.ollama_base_url.rstrip('/')}/api/chat",
                json={
                    "model": settings.ollama_model,
                    "messages": [
                        {"role": "system", "content": "You are a helpful AI engineering assistant."},
                        {"role": "user", "content": message},
                    ],
                    "stream": False,
                    "options": {"num_predict": max_output_tokens},
                },
            )
            response.raise_for_status()
            return response.json()["message"]["content"]

    if provider == "huggingface":
        client = create_huggingface_client()
        response = await client.chat.completions.create(
            model=settings.hf_model,
            messages=[
                {"role": "system", "content": "You are a helpful AI engineering assistant."},
                {"role": "user", "content": message},
            ],
            max_tokens=max_output_tokens,
        )
        usage = response.usage
        if usage is not None:
            logger.info(
                "agent_llm_token_usage",
                model=settings.hf_model,
                input_tokens=usage.prompt_tokens,
                output_tokens=usage.completion_tokens,
                total_tokens=usage.total_tokens,
            )
        return response.choices[0].message.content or ""

    if provider != "openai":
        raise RuntimeError("Unsupported LLM provider")

    client = create_llm_client()

    response = await client.responses.create(
        model="gpt-4.1-mini",
        instructions="You are a helpful AI engineering assistant.",
        input=message,
        max_output_tokens=max_output_tokens,
    )

    usage = response.usage
    if usage is not None:
        logger.info("agent_llm_token_usage", model="gpt-4.1-mini",
                    input_tokens=usage.input_tokens,
                    output_tokens=usage.output_tokens,
                    total_tokens=usage.total_tokens)
    return response.output_text
