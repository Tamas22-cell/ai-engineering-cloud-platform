from langchain_mcp_adapters.client import MultiServerMCPClient

def create_blockchain_client():
    return MultiServerMCPClient({
        "blockchain": {
            "transport": "streamable_http",
            "url": "http://localhost:8001/mcp",
        }
    })

async def get_blockchain_tools():
    client = create_blockchain_client()
    return await client.get_tools()
