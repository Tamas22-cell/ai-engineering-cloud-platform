from agents.tool_agent import tools as quantum_tools
from agents.blockchain_mcp_adapter import get_blockchain_tools

async def get_all_agent_tools():
    blockchain_tools = await get_blockchain_tools()
    allowed = {
        "platform_status",
        "bitcoin_latest_block",
        "bitcoin_wallet_balance",
        "bitcoin_transaction_history",
        "ethereum_latest_block",
        "ethereum_wallet_balance",
        "solana_latest_slot",
        "solana_wallet_balance",
        "solana_recent_transactions",
    }
    safe_tools = [t for t in blockchain_tools if t.name in allowed]
    return list(quantum_tools) + safe_tools
