from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from core.rate_limit import rate_limit


def make_request(path="/auth/login"):
    return Request({
        "type": "http",
        "method": "POST",
        "path": path,
        "headers": [],
        "client": ("127.0.0.1", 12345),
        "scheme": "http",
        "server": ("testserver", 80),
        "query_string": b"",
    })


@pytest.mark.asyncio
async def test_login_rate_limit():
    pipe = MagicMock()
    pipe.incr = MagicMock()
    pipe.expire = MagicMock()
    pipe.execute = AsyncMock()
    pipe.execute.side_effect = [
        [n, True] for n in range(1, 7)
    ]

    client = MagicMock()
    client.aclose = AsyncMock()
    client.pipeline.return_value.__aenter__.return_value = pipe

    with patch("core.rate_limit.redis.from_url", return_value=client):
        check = rate_limit(5)

        for _ in range(5):
            await check(make_request())

        with pytest.raises(HTTPException) as exc:
            await check(make_request())

    assert exc.value.status_code == 429


@pytest.mark.asyncio
async def test_register_rate_limit():
    pipe = MagicMock()
    pipe.incr = MagicMock()
    pipe.expire = MagicMock()
    pipe.execute = AsyncMock()
    pipe.execute.side_effect = [
        [n, True] for n in range(1, 5)
    ]

    client = MagicMock()
    client.aclose = AsyncMock()
    client.pipeline.return_value.__aenter__.return_value = pipe

    with patch("core.rate_limit.redis.from_url", return_value=client):
        check = rate_limit(3)

        for _ in range(3):
            await check(make_request("/auth/register"))

        with pytest.raises(HTTPException) as exc:
            await check(make_request("/auth/register"))

    assert exc.value.status_code == 429


@pytest.mark.asyncio
async def test_redis_unavailable():
    import redis.asyncio as redis

    client = MagicMock()
    client.aclose = AsyncMock()

    pipe = MagicMock()
    pipe.incr = MagicMock()
    pipe.expire = MagicMock()
    pipe.execute = AsyncMock(
        side_effect=redis.RedisError("Connection failed")
    )

    client.pipeline.return_value.__aenter__.return_value = pipe

    with patch("core.rate_limit.redis.from_url", return_value=client):
        with pytest.raises(HTTPException) as exc:
            await rate_limit(5)(make_request())

    assert exc.value.status_code == 503
    assert exc.value.detail == "Rate limiting service unavailable"
