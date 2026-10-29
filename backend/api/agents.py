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
