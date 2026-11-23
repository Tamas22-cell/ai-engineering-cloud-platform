import asyncio
from agents.unified_agent import create_unified_agent
from langchain_core.messages import HumanMessage

async def main():
    agent = await create_unified_agent()
    result = await agent.ainvoke(
        {"messages": [HumanMessage(content="Use bitcoin_latest_block to retrieve the latest Bitcoin block. Do not use other tools.")]},
        config={"recursion_limit": 6}
    )
    print("TOOLS:", [m.name for m in result["messages"] if m.type == "tool"])
    print("RESULT:", result["messages"][-1].content)

asyncio.run(main())
