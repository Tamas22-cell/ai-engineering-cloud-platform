import json

import httpx
from agents.llm_client import create_huggingface_client
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

        if settings.llm_provider.lower() == "huggingface":
            hf_messages = [{"role": "system", "content": "Select the correct tool. Never invent arguments."}]
            for message in state["messages"]:
                if isinstance(message, HumanMessage):
                    hf_messages.append({"role": "user", "content": str(message.content)})
                elif isinstance(message, AIMessage):
                    assistant_message = {
                        "role": "assistant",
                        "content": str(message.content or ""),
                    }
                    if message.tool_calls:
                        assistant_message["tool_calls"] = [
                            {
                                "id": call["id"],
                                "type": "function",
                                "function": {
                                    "name": call["name"],
                                    "arguments": json.dumps(call["args"]),
                                },
                            }
                            for call in message.tool_calls
                        ]
                    hf_messages.append(assistant_message)
                elif isinstance(message, ToolMessage):
                    hf_messages.append({
                        "role": "tool",
                        "tool_call_id": message.tool_call_id,
                        "content": str(message.content),
                    })

            client = create_huggingface_client()
            response = await client.chat.completions.create(
                model=settings.hf_model,
                messages=hf_messages,
                tools=definitions,
                tool_choice="auto",
                max_tokens=300,
            )
            choice = response.choices[0].message
            result = {
                "content": choice.content or "",
                "tool_calls": [
                    {
                        "id": call.id,
                        "function": {
                            "name": call.function.name,
                            "arguments": call.function.arguments or "{}",
                        },
                    }
                    for call in (choice.tool_calls or [])
                ],
            }
        elif settings.llm_provider.lower() == "ollama":
            async with httpx.AsyncClient(timeout=180) as client:
                r = await client.post(settings.ollama_base_url.rstrip("/") + "/api/chat", json={"model": settings.ollama_model, "messages": messages, "tools": definitions, "stream": False, "think": False})
                r.raise_for_status()
                result = r.json()["message"]
        else:
            raise RuntimeError("Unsupported LLM provider")

        calls = []
        for i, call in enumerate(result.get("tool_calls", [])):
            fn = call.get("function", {})
            name = fn.get("name")
            if name not in allowed:
                continue
            args = fn.get("arguments", {})
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except json.JSONDecodeError:
                    args = {}
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
