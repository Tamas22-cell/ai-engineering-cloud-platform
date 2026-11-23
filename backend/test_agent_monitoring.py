from fastapi.testclient import TestClient
from main import app

with TestClient(app) as client:
    response = client.post(
        "/agent/invoke",
        json={"message": "Use bitcoin_latest_block to retrieve the latest Bitcoin block."}
    )
    metrics = client.get("/agent/metrics")

    print("AGENT HTTP:", response.status_code)
    print("TOOLS:", response.json().get("tools_used"))
    print("METRICS HTTP:", metrics.status_code)
    print("METRICS:", metrics.json())
