import httpx
from agents.unified_tools import get_all_agent_tools
from agents.ollama_quantum_agent import route_tools
from core.config import settings
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.graph import StateGraph, START, MessagesState
from langgraph.prebuilt import ToolNode

async def create_unified_agent():
    tools = await get_all_agent_tools()
    allowed = {t.name: t for t in tools}

    async def agent_node(state: MessagesState):
        definitions = []
        for t in tools:
            schema = t.args_schema
            if isinstance(schema, dict):
                params = schema
            elif hasattr(schema, "model_json_schema"):
                params = schema.model_json_schema()
            else:
                params = {"type": "object", "properties": {}}
            definitions.append({"type": "function", "function": {"name": t.name, "description": t.description or t.name, "parameters": params}})

        messages = [{"role": "system", "content": "Select the correct tool. Never invent arguments."}]
        for m in state["messages"]:
            if isinstance(m, HumanMessage):
                messages.append({"role": "user", "content": str(m.content)})
            elif isinstance(m, ToolMessage):
                messages.append({"role": "tool", "content": str(m.content)})

        async with httpx.AsyncClient(timeout=180) as client:
            r = await client.post(settings.ollama_base_url.rstrip("/") + "/api/chat", json={"model": settings.ollama_model, "messages": messages, "tools": definitions, "stream": False, "think": False})
            r.raise_for_status()
            result = r.json()["message"]

        calls = []
        for i, call in enumerate(result.get("tool_calls", [])):
            fn = call.get("function", {})
            name = fn.get("name")
            if name not in allowed:
                continue
            args = fn.get("arguments", {})
            if not isinstance(args, dict):
                args = {}
            schema = allowed[name].args_schema
            if isinstance(schema, dict):
                fields = set(schema.get("properties", {}))
            elif hasattr(schema, "model_fields"):
                fields = set(schema.model_fields)
            else:
                fields = set()
            args = {k: v for k, v in args.items() if k in fields}
            calls.append({"name": name, "args": args, "id": call.get("id") or f"call-{i}", "type": "tool_call"})

        return {"messages": [AIMessage(content=result.get("content") or "", tool_calls=calls)]}

    graph = StateGraph(MessagesState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", ToolNode(tools))
    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", route_tools)
    graph.add_edge("tools", "agent")
    return graph.compile()
