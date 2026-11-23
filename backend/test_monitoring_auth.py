import os
from fastapi.testclient import TestClient
from main import app

original = os.environ.get("MONITORING_API_KEY")

try:
    with TestClient(app) as client:
        os.environ.pop("MONITORING_API_KEY", None)
        missing = client.get("/agent/metrics")

        os.environ["MONITORING_API_KEY"] = "temporary-test-key"
        wrong = client.get(
            "/agent/metrics",
            headers={"X-Monitoring-Key": "wrong-key"}
        )
        valid = client.get(
            "/agent/metrics",
            headers={"X-Monitoring-Key": "temporary-test-key"}
        )

        print("NO CONFIG:", missing.status_code)
        print("WRONG KEY:", wrong.status_code)
        print("VALID KEY:", valid.status_code)
        print("METRICS:", valid.json())

        assert [missing.status_code, wrong.status_code, valid.status_code] == [503, 401, 200]
        print("MONITORING AUTH TEST PASSED")
finally:
    if original is None:
        os.environ.pop("MONITORING_API_KEY", None)
    else:
        os.environ["MONITORING_API_KEY"] = original
