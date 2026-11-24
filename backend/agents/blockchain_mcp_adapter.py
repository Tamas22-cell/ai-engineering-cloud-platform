"""Small stateless Streamable HTTP MCP client for the blockchain tools."""

import itertools
import os
import re
from typing import Any

import httpx
from langchain_core.tools import StructuredTool
from pydantic import Field, create_model


_request_ids = itertools.count(1)


def _blockchain_mcp_url() -> str:
    """Return the MCP endpoint reachable from this process/container."""
    return os.getenv("BLOCKCHAIN_MCP_URL", "http://localhost:8001/mcp").rstrip("/")


async def _rpc(method: str, params: dict[str, Any]) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            _blockchain_mcp_url(),
            json={"jsonrpc": "2.0", "id": next(_request_ids), "method": method, "params": params},
            headers={"Accept": "application/json, text/event-stream"},
        )
    response.raise_for_status()
    payload = response.json()
    if "error" in payload:
        error = payload["error"]
        raise RuntimeError(f"MCP {method} failed: {error.get('message', error)}")
    return payload.get("result", {})


def _python_type(schema: dict[str, Any]) -> type:
    kind = schema.get("type")
    if kind == "integer":
        return int
    if kind == "number":
        return float
    if kind == "boolean":
        return bool
    if kind == "array":
        return list
    if kind == "object":
        return dict
    return str


def _argument_model(name: str, schema: dict[str, Any]):
    properties = schema.get("properties", {})
    required = set(schema.get("required", []))
    fields = {}
    for field_name, definition in properties.items():
        value_type = _python_type(definition)
        description = definition.get("description", "")
        if field_name in required:
            fields[field_name] = (value_type, Field(..., description=description))
        else:
            fields[field_name] = (value_type | None, Field(None, description=description))
    safe_name = re.sub(r"\W+", "_", name)
    return create_model(f"MCP_{safe_name}_Arguments", **fields)


async def _call_tool(name: str, arguments: dict[str, Any]) -> str:
    result = await _rpc("tools/call", {"name": name, "arguments": arguments})
    if result.get("isError"):
        raise RuntimeError(f"MCP tool {name} returned an error")
    if "structuredContent" in result:
        return str(result["structuredContent"])
    return "\n".join(
        str(item.get("text", item)) if isinstance(item, dict) else str(item)
        for item in result.get("content", [])
    )


async def get_blockchain_tools() -> list[StructuredTool]:
    """Discover MCP tools over JSON-RPC and expose them as LangChain tools."""
    result = await _rpc("tools/list", {})
    tools = []
    for definition in result.get("tools", []):
        name = definition["name"]

        async def invoke(_tool_name=name, **arguments):
            return await _call_tool(_tool_name, arguments)

        tools.append(
            StructuredTool(
                name=name,
                description=definition.get("description") or name,
                args_schema=_argument_model(name, definition.get("inputSchema", {})),
                coroutine=invoke,
            )
        )
    return tools
