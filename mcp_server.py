from mcp.server.fastmcp import FastMCP; mcp = FastMCP("AI Engineering MCP", host="0.0.0.0", port=8001, stateless_http=True, json_response=True); mcp.tool(name="platform_status")(lambda: "AI ENGINEERING MCP OK"); from ethereum_tool import ethereum_latest_block; mcp.tool(name="ethereum_latest_block")(ethereum_latest_block); from ethereum_wallet import ethereum_wallet_balance; mcp.tool(name="ethereum_wallet_balance")(ethereum_wallet_balance); from solana_tool import solana_latest_slot, solana_wallet_balance; mcp.tool(name="solana_latest_slot")(solana_latest_slot); mcp.tool(name="solana_wallet_balance")(solana_wallet_balance); from solana_tool import solana_recent_transactions; mcp.tool(name="solana_recent_transactions")(solana_recent_transactions); from bitcoin_tool import bitcoin_latest_block; mcp.tool(name="bitcoin_latest_block")(bitcoin_latest_block);








from bitcoin_tool import bitcoin_wallet_balance; mcp.tool(name='bitcoin_wallet_balance')(bitcoin_wallet_balance)
from bitcoin_tool import bitcoin_transaction_history; mcp.tool(name='bitcoin_transaction_history')(bitcoin_transaction_history)
mcp.run(transport="streamable-http")
