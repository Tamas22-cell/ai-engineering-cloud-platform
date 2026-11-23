import os

from langchain_mcp_adapters.client import MultiServerMCPClient


def _blockchain_mcp_url() -> str:
    """Return the MCP endpoint reachable from this process/container."""
    return os.getenv("BLOCKCHAIN_MCP_URL", "http://localhost:8001/mcp").rstrip("/")

def create_blockchain_client():
    return MultiServerMCPClient({
        "blockchain": {
            "transport": "streamable_http",
            "url": _blockchain_mcp_url(),
        }
    })

async def get_blockchain_tools():
    client = create_blockchain_client()
    return await client.get_tools()
