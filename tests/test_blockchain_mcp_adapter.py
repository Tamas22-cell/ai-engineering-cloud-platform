from pathlib import Path

import yaml

from agents.blockchain_mcp_adapter import _blockchain_mcp_url


def test_blockchain_mcp_url_uses_localhost_by_default(monkeypatch):
    monkeypatch.delenv("BLOCKCHAIN_MCP_URL", raising=False)

    assert _blockchain_mcp_url() == "http://localhost:8001/mcp"


def test_blockchain_mcp_url_accepts_container_service_name(monkeypatch):
    monkeypatch.setenv("BLOCKCHAIN_MCP_URL", "http://mcp:8001/mcp/")

    assert _blockchain_mcp_url() == "http://mcp:8001/mcp"


def test_compose_mcp_override_routes_backend_to_mcp_service():
    compose_path = Path(__file__).parents[1] / "docker-compose.mcp.yml"
    compose = yaml.safe_load(compose_path.read_text(encoding="utf-8-sig"))
    services = compose["services"]

    assert services["backend"]["environment"]["BLOCKCHAIN_MCP_URL"] == "http://mcp:8001/mcp"
    base_compose = yaml.safe_load((compose_path.parent / "docker-compose.yml").read_text(encoding="utf-8-sig"))
    assert "MONITORING_API_KEY=${MONITORING_API_KEY:-}" in base_compose["services"]["backend"]["environment"]
    assert services["backend"]["depends_on"]["mcp"]["condition"] == "service_started"
    assert "build" in services["mcp"]
