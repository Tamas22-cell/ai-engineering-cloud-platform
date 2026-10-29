from fastapi import Depends, HTTPException
from core.dependencies import get_current_user
from agents.llm_agent import llm_agent
from fastapi import APIRouter
from pydantic import BaseModel, Field

from agents.basic_agent import agent


router = APIRouter(prefix="/agents", tags=["agents"])


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
        result = await llm_agent.ainvoke({
            "message": data.message,
            "response": "",
        })
        return ChatResponse(response=result["response"])
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="LLM service unavailable",
        )
