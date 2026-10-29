from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
from langgraph.graph import StateGraph, START, END, MessagesState
from langgraph.prebuilt import ToolNode

from agents.llm_client import create_llm_client
from agents.tools.calculator import add_numbers


TOOLS = [add_numbers]


def route_tools(state: MessagesState):
    last = state["messages"][-1]
    return "tools" if getattr(last, "tool_calls", None) else END


async def call_model(state: MessagesState):
    client = create_llm_client()

    tool_definition = {
        "type": "function",
        "name": "add_numbers",
        "description": "Add two numbers.",
        "parameters": {
            "type": "object",
            "properties": {
                "a": {"type": "number"},
                "b": {"type": "number"},
            },
            "required": ["a", "b"],
            "additionalProperties": False,
        },
        "strict": True,
    }

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
        tools=[tool_definition],
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
