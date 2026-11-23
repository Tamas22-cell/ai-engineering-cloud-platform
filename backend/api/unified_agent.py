from agents.monitoring_auth import require_monitoring_key
import time
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from langchain_core.messages import HumanMessage
from agents.unified_agent import create_unified_agent
from agents.monitoring import record_run, get_metrics

router = APIRouter(prefix="/agent", tags=["Unified AI Agent"])


class AgentRequest(BaseModel):
    message: str


@router.post("/invoke")
async def invoke_agent(request: AgentRequest):
    start = time.perf_counter()
    tools_used = []

    try:
        agent = await create_unified_agent()
        result = await agent.ainvoke(
            {"messages": [HumanMessage(content=request.message)]},
            config={"recursion_limit": 6}
        )

        tools_used = [
            m.name for m in result["messages"]
            if m.type == "tool"
        ]

        return {
            "response": str(result["messages"][-1].content),
            "tools_used": tools_used
        }

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Agent execution failed"
        )

    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        record_run(
            duration_ms=duration_ms,
            tools_used=tools_used,
            success=not bool(__import__("sys").exc_info()[0])
        )


@router.get("/metrics", dependencies=[Depends(require_monitoring_key)])
async def agent_metrics():
    return get_metrics()
