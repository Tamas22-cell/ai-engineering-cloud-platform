import json

import httpx
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
from langgraph.graph import StateGraph, START, END, MessagesState
from langgraph.prebuilt import ToolNode

from agents.llm_client import create_llm_client
from agents.tools.calculator import add_numbers


@tool
async def inspect_project_github() -> str:
    """Read the latest public GitHub repository metadata and commits for this AI Engineering project. Read-only; no credentials or arbitrary URLs."""
    base = "https://api.github.com/repos/Tamas22-cell/ai-engineering-cloud-platform"
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=False, headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "ai-engineering-cloud-platform-agent",
        }) as client:
            repository_response = await client.get(base)
            repository_response.raise_for_status()
            commits_response = await client.get(base + "/commits", params={"per_page": 5})
            commits_response.raise_for_status()
        repository = repository_response.json()
        commits = commits_response.json()
        return json.dumps({
            "repository": repository.get("full_name"),
            "default_branch": repository.get("default_branch"),
            "open_issues_count": repository.get("open_issues_count"),
            "updated_at": repository.get("updated_at"),
            "latest_commits": [
                {"sha": c.get("sha", "")[:12],
                 "message": c.get("commit", {}).get("message", "").split("\\n")[0][:200],
                 "date": c.get("commit", {}).get("committer", {}).get("date")}
                for c in commits[:5]
            ],
            "source": base,
        }, ensure_ascii=False)
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        return json.dumps({"error": "GitHub data unavailable", "error_type": type(exc).__name__})


TOOLS = [add_numbers, inspect_project_github]

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "name": "add_numbers",
        "description": "Add two numbers.",
        "parameters": {
            "type": "object",
            "properties": {"a": {"type": "number"}, "b": {"type": "number"}},
            "required": ["a", "b"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "inspect_project_github",
        "description": "Retrieve real public GitHub repository metadata and the latest five commits for the AI Engineering Cloud Platform. Use for project status questions; do not invent results.",
        "parameters": {"type": "object", "properties": {}, "required": [], "additionalProperties": False},
        "strict": True,
    },
]


def route_tools(state: MessagesState):
    last = state["messages"][-1]
    return "tools" if getattr(last, "tool_calls", None) else END


async def call_model(state: MessagesState):
    client = create_llm_client()

    # Preserve the conversation, including previous tool results.
    input_items = []

    for message in state["messages"]:
        if isinstance(message, HumanMessage):
            input_items.append({
                "role": "user",
                "content": message.content,
            })
        elif isinstance(message, ToolMessage):
            input_items.append({
                "type": "function_call_output",
                "call_id": message.tool_call_id,
                "output": str(message.content),
            })
        elif isinstance(message, AIMessage):
            for call in message.tool_calls:
                import json
                input_items.append({
                    "type": "function_call",
                    "name": call["name"],
                    "arguments": json.dumps(call["args"]),
                    "call_id": call["id"],
                })
            if message.content:
                input_items.append({
                    "role": "assistant",
                    "content": message.content,
                })

    response = await client.responses.create(
        model="gpt-4.1-mini",
        input=input_items,
        tools=TOOL_DEFINITIONS,
        max_output_tokens=300,
    )

    tool_calls = []
    texts = []

    for item in response.output:
        if item.type == "function_call":
            import json
            tool_calls.append({
                "name": item.name,
                "args": json.loads(item.arguments),
                "id": item.call_id,
                "type": "tool_call",
            })
        elif item.type == "message":
            for content in item.content:
                if content.type == "output_text":
                    texts.append(content.text)

    return {
        "messages": [
            AIMessage(
                content="\n".join(texts),
                tool_calls=tool_calls,
            )
        ]
    }


graph = StateGraph(MessagesState)
graph.add_node("agent", call_model)
graph.add_node("tools", ToolNode(TOOLS))

graph.add_edge(START, "agent")
graph.add_conditional_edges("agent", route_tools)
graph.add_edge("tools", "agent")

gpt_tool_agent = graph.compile()

async def run_gpt_tool_agent(message: str):
    """Run the GPT tool agent with a bounded number of graph steps."""
    from langchain_core.messages import HumanMessage

    return await gpt_tool_agent.ainvoke(
        {"messages": [HumanMessage(content=message)]},
        config={"recursion_limit": 10},
    )
