import json
import os
import xml.etree.ElementTree as ET
import structlog

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
    feed_url = "https://github.com/Tamas22-cell/ai-engineering-cloud-platform/commits/main.atom"
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "ai-engineering-cloud-platform-agent"}
    token = os.getenv("GITHUB_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True, headers=headers) as client:
            response = await client.get(base + "/commits", params={"per_page": 5})
            if response.status_code in (403, 429):
                # Public Atom feed is a separate, read-only fallback for API rate limits.
                feed_response = await client.get(feed_url, headers={
                    "Accept": "application/atom+xml",
                    "User-Agent": "ai-engineering-cloud-platform-agent",
                })
                feed_response.raise_for_status()
                root = ET.fromstring(feed_response.text)
                ns = {"atom": "http://www.w3.org/2005/Atom"}
                commits = []
                for entry in root.findall("atom:entry", ns)[:5]:
                    url = entry.findtext("atom:id", default="", namespaces=ns)
                    sha = url.rstrip("/").split("/")[-1]
                    if len(sha) != 40 or any(ch not in "0123456789abcdef" for ch in sha.lower()):
                        raise ValueError("Unexpected GitHub feed commit identifier")
                    commits.append({
                        "sha": sha[:12],
                        "message": entry.findtext("atom:title", default="", namespaces=ns).strip()[:200],
                        "date": entry.findtext("atom:updated", default="", namespaces=ns),
                    })
                if not commits:
                    raise ValueError("No commits found in GitHub Atom feed")
                structlog.get_logger().info("github_tool_atom_fallback", count=len(commits))
                return json.dumps({"repository": "Tamas22-cell/ai-engineering-cloud-platform",
                                   "latest_commits": commits, "source": feed_url}, ensure_ascii=False)
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, list):
                raise ValueError("Unexpected GitHub API response")
            commits = [{
                "sha": c["sha"][:12],
                "message": c["commit"]["message"].split("\\n")[0][:200],
                "date": c["commit"]["committer"]["date"],
            } for c in data[:5]]
            return json.dumps({"repository": "Tamas22-cell/ai-engineering-cloud-platform",
                               "latest_commits": commits, "source": base + "/commits"}, ensure_ascii=False)
    except httpx.HTTPStatusError as exc:
        structlog.get_logger().warning("github_tool_http_error", status_code=exc.response.status_code)
        return json.dumps({"error": "GitHub request failed", "status_code": exc.response.status_code})
    except (httpx.HTTPError, ET.ParseError, ValueError, KeyError, TypeError) as exc:
        structlog.get_logger().warning("github_tool_error", error_type=type(exc).__name__)
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

    usage = response.usage
    if usage is not None:
        structlog.get_logger().info(
            "agent_tool_llm_token_usage", model="gpt-4.1-mini",
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            total_tokens=usage.total_tokens,
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

    # Return actual tool results for explicit GitHub inspection requests.
    request = message.casefold()
    if any(word in request for word in ("github", "repository", "repo")) and any(
        word in request for word in ("commit", "sha", "repository", "repo", "github")
    ):
        raw = await inspect_project_github.ainvoke({})
        data = json.loads(raw)
        if "error" in data:
            answer = "GitHub API lekérdezés sikertelen: " + json.dumps(data, ensure_ascii=False)
        else:
            lines = [f"Repository: {data['repository']}", "Utolsó 5 commit:"]
            for commit in data["latest_commits"]:
                lines.append(f"- {commit['sha']} | {commit['date']} | {commit['message']}")
            lines.append(f"Forrás: {data['source']}")
            answer = "\n".join(lines)
        return {"messages": [HumanMessage(content=message),
                             ToolMessage(content=raw, tool_call_id="github-inspection"),
                             AIMessage(content=answer)]}

    return await gpt_tool_agent.ainvoke(
        {"messages": [HumanMessage(content=message)]},
        config={"recursion_limit": 10},
    )
