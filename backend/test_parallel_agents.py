import asyncio
from agents.unified_agent import create_unified_agent
from langchain_core.messages import HumanMessage

async def run_test(prompt):
    agent = await create_unified_agent()
    result = await agent.ainvoke(
        {"messages": [HumanMessage(content=prompt)]},
        config={"recursion_limit": 6}
    )
    return [m.name for m in result["messages"] if m.type == "tool"]

async def main():
    results = await asyncio.gather(
        run_test("Use bitcoin_latest_block to retrieve the latest Bitcoin block."),
        run_test("Use solana_latest_slot to retrieve the latest Solana slot.")
    )
    print("BITCOIN TOOLS:", results[0])
    print("SOLANA TOOLS:", results[1])

asyncio.run(main())
