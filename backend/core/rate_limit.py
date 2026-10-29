import hashlib

import redis.asyncio as redis
from fastapi import HTTPException, Request, status

from core.config import settings


def rate_limit(max_requests: int, window_seconds: int = 60):
    async def check_rate_limit(request: Request):
        client_ip = request.client.host if request.client else "unknown"
        ip_hash = hashlib.sha256(client_ip.encode()).hexdigest()
        key = f"rate_limit:{request.url.path}:{ip_hash}"

        client = redis.from_url(settings.redis_url, decode_responses=True)

        try:
            async with client.pipeline(transaction=True) as pipe:
                pipe.incr(key)
                pipe.expire(key, window_seconds, nx=True)
                results = await pipe.execute()
        except redis.RedisError:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Rate limiting service unavailable",
            )
        finally:
            await client.aclose()

        if results[0] > max_requests:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests",
                headers={"Retry-After": str(window_seconds)},
            )

    return check_rate_limit
