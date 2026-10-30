import asyncio
import structlog

from agents.gpt_tool_agent import run_gpt_tool_agent
from fastapi import Depends, HTTPException
from core.dependencies import get_current_user
from agents.llm_agent import llm_agent
from fastapi import APIRouter
from pydantic import BaseModel, Field

from agents.basic_agent import agent


router = APIRouter(prefix="/agents", tags=["agents"])
logger = structlog.get_logger()


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class ChatResponse(BaseModel):
    response: str


@router.post("/chat", response_model=ChatResponse)
async def chat(data: ChatRequest):
    result = await agent.ainvoke({
        "message": data.message,
        "response": "",
    })
    return ChatResponse(response=result["response"])

@router.post("/llm-chat", response_model=ChatResponse)
async def llm_chat(
    data: ChatRequest,
    user = Depends(get_current_user),
):
    try:
        result = await asyncio.wait_for(
            llm_agent.ainvoke({
                "message": data.message,
                "response": "",
            }),
            timeout=30,
        )
        return ChatResponse(response=result["response"])
    except TimeoutError:
        logger.warning("llm_agent_timeout", timeout_seconds=30)
        raise HTTPException(status_code=504, detail="LLM request timed out")
    except Exception as exc:
        logger.error("llm_agent_failure", error_type=type(exc).__name__)
        raise HTTPException(
            status_code=503,
            detail="LLM service unavailable",
        )

@router.post("/tool-chat", response_model=ChatResponse)
async def tool_chat(
    data: ChatRequest,
    user = Depends(get_current_user),
):
    try:
        result = await asyncio.wait_for(run_gpt_tool_agent(data.message), timeout=30)
        return ChatResponse(response=str(result["messages"][-1].content))
    except TimeoutError:
        logger.warning("tool_agent_timeout", timeout_seconds=30)
        raise HTTPException(status_code=504, detail="AI tool request timed out")
    except Exception as exc:
        from langgraph.errors import GraphRecursionError

        if isinstance(exc, GraphRecursionError):
            logger.warning("tool_agent_step_limit")
            raise HTTPException(
                status_code=429,
                detail="Agent step limit exceeded",
            )

        logger.error("tool_agent_failure", error_type=type(exc).__name__)
        raise HTTPException(
            status_code=503,
            detail="AI tool service unavailable",
        )
