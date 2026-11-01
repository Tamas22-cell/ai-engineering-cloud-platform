"""Additional rate-limit security regression tests."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from core.rate_limit import rate_limit


def request(path, ip):
    return Request({
        "type": "http", "method": "POST", "path": path,
        "headers": [], "client": (ip, 1234), "scheme": "http",
        "server": ("testserver", 80), "query_string": b"",
    })


def mock_redis(count):
    pipe = MagicMock()
    pipe.execute = AsyncMock(return_value=[count, True])
    client = MagicMock()
    client.aclose = AsyncMock()
    client.pipeline.return_value.__aenter__.return_value = pipe
    return client, pipe


@pytest.mark.asyncio
async def test_rate_limit_returns_retry_after():
    client, _ = mock_redis(6)
    with patch("core.rate_limit.redis.from_url", return_value=client):
        with pytest.raises(HTTPException) as exc:
            await rate_limit(5, window_seconds=45)(request("/auth/login", "127.0.0.1"))
    assert exc.value.status_code == 429
    assert exc.value.headers["Retry-After"] == "45"
    client.aclose.assert_awaited_once()


@pytest.mark.asyncio
async def test_rate_limit_key_separates_paths_and_ips():
    client, pipe = mock_redis(1)
    with patch("core.rate_limit.redis.from_url", return_value=client):
        await rate_limit(5)(request("/auth/login", "127.0.0.1"))
        await rate_limit(5)(request("/auth/register", "127.0.0.1"))
        await rate_limit(5)(request("/auth/login", "127.0.0.2"))
    keys = [call.args[0] for call in pipe.incr.call_args_list]
    assert len(set(keys)) == 3
    assert all(key.startswith("rate_limit:") for key in keys)
    assert all("127.0.0." not in key for key in keys)
