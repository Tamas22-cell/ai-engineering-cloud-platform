import asyncio
import structlog
from openai import AuthenticationError, PermissionDeniedError, RateLimitError, APIConnectionError, APIStatusError

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
    except AuthenticationError:
        logger.error("llm_agent_auth_failed")
        raise HTTPException(status_code=503, detail="OpenAI API authentication failed. Check OPENAI_API_KEY on Render.")
    except PermissionDeniedError:
        logger.error("llm_agent_permission_denied")
        raise HTTPException(status_code=503, detail="OpenAI project does not permit this model or operation.")
    except RateLimitError:
        logger.warning("llm_agent_rate_limited")
        raise HTTPException(status_code=503, detail="OpenAI rate limit or API quota reached. Check API billing and usage.")
    except APIConnectionError:
        logger.error("llm_agent_connection_error")
        raise HTTPException(status_code=503, detail="Cannot connect to OpenAI API.")
    except APIStatusError as exc:
        logger.error("llm_agent_api_status", status_code=exc.status_code)
        raise HTTPException(status_code=503, detail=f"OpenAI API returned HTTP {exc.status_code}.")
    except RuntimeError:
        logger.error("llm_agent_not_configured")
        raise HTTPException(status_code=503, detail="OpenAI API key is not configured on Render.")
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
from uuid import UUID, uuid4
from agents.planner_executor_reviewer import run_planner_executor_reviewer


class WorkflowRequest(BaseModel):
    task: str = Field(min_length=1, max_length=4000)
    thread_id: UUID | None = None


class WorkflowResponse(BaseModel):
    thread_id: UUID
    response: str


@router.post("/workflow", response_model=WorkflowResponse)
async def workflow_chat(
    data: WorkflowRequest,
    user=Depends(get_current_user),
):
    thread_id = data.thread_id or uuid4()

    try:
        result = await asyncio.wait_for(
            run_planner_executor_reviewer(
                task=data.task,
                thread_id=str(thread_id),
            ),
            timeout=60,
        )
        return WorkflowResponse(
            thread_id=thread_id,
            response=result["final_answer"],
        )
    except TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="AI workflow timed out",
        )
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="AI workflow unavailable",
        )
