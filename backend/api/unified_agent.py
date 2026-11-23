from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from langchain_core.messages import HumanMessage
from agents.unified_agent import create_unified_agent

router = APIRouter(prefix="/agent", tags=["Unified AI Agent"])

class AgentRequest(BaseModel):
    message: str

@router.post("/invoke")
async def invoke_agent(request: AgentRequest):
    try:
        agent = await create_unified_agent()
        result = await agent.ainvoke(
            {"messages": [HumanMessage(content=request.message)]},
            config={"recursion_limit": 6}
        )
        return {
            "response": str(result["messages"][-1].content),
            "tools_used": [m.name for m in result["messages"] if m.type == "tool"]
        }
    except Exception:
        raise HTTPException(status_code=500, detail="Agent execution failed")
