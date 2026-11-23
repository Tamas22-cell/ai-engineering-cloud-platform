import httpx
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.graph import StateGraph, START, END, MessagesState
from langgraph.prebuilt import ToolNode
from agents.tool_agent import tools
from core.config import settings

async def agent_node(state: MessagesState):
    definitions = [{"type": "function", "function": {"name": t.name, "description": t.description or t.name, "parameters": t.args_schema.model_json_schema() if t.args_schema else {"type": "object", "properties": {}}}} for t in tools]
    messages = [{"role": "system", "content": "Choose the appropriate tool. Do not invent arguments."}]
    for m in state["messages"]:
        if isinstance(m, HumanMessage):
            messages.append({"role": "user", "content": str(m.content)})
        elif isinstance(m, ToolMessage):
            messages.append({"role": "tool", "content": str(m.content)})
    async with httpx.AsyncClient(timeout=180) as client:
        r = await client.post(settings.ollama_base_url.rstrip("/") + "/api/chat", json={"model": "qwen3:8b", "messages": messages, "tools": definitions, "stream": False, "think": False})
        r.raise_for_status()
        result = r.json()["message"]
    allowed = {t.name: t for t in tools}
    calls = []
    for i, call in enumerate(result.get("tool_calls", [])):
        fn = call.get("function", {})
        name = fn.get("name")
        if name not in allowed:
            continue
        args = fn.get("arguments", {})
        if not isinstance(args, dict):
            args = {}
        fields = set(allowed[name].args_schema.model_fields) if allowed[name].args_schema else set()
        args = {k: v for k, v in args.items() if k in fields}
        calls.append({"name": name, "args": args, "id": call.get("id") or f"call-{i}", "type": "tool_call"})
    return {"messages": [AIMessage(content=result.get("content") or "", tool_calls=calls)]}

def route_tools(state: MessagesState):
    return "tools" if getattr(state["messages"][-1], "tool_calls", None) else END

graph = StateGraph(MessagesState)
graph.add_node("agent", agent_node)
graph.add_node("tools", ToolNode(tools))
graph.add_edge(START, "agent")
graph.add_conditional_edges("agent", route_tools)
graph.add_edge("tools", "agent")
ollama_quantum_agent = graph.compile()
