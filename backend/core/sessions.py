from datetime import datetime, timezone

import redis.asyncio as redis
import jwt

from core.config import settings


async def save_refresh_token(token: str) -> None:
    payload = jwt.decode(
        token,
        settings.secret_key,
        algorithms=[settings.algorithm],
    )

    if payload.get("type") != "refresh" or not payload.get("jti"):
        raise ValueError("Invalid refresh token")

    ttl = int(payload["exp"] - datetime.now(timezone.utc).timestamp())

    if ttl <= 0:
        raise ValueError("Expired refresh token")

    client = redis.from_url(settings.redis_url, decode_responses=True)
    try:
        await client.set(
            f"refresh_token:{payload['jti']}",
            str(payload["sub"]),
            ex=ttl,
        )
    finally:
        await client.aclose()


async def revoke_refresh_token(jti: str) -> None:
    client = redis.from_url(settings.redis_url, decode_responses=True)
    try:
        await client.delete(f"refresh_token:{jti}")
    finally:
        await client.aclose()


async def is_refresh_token_active(token: str) -> bool:
    from jwt.exceptions import InvalidTokenError

    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],
        )
    except InvalidTokenError:
        return False

    if (
        payload.get("type") != "refresh"
        or not payload.get("jti")
        or not payload.get("sub")
    ):
        return False

    client = redis.from_url(settings.redis_url, decode_responses=True)
    try:
        stored_user_id = await client.get(
            f"refresh_token:{payload['jti']}"
        )
        return stored_user_id == str(payload["sub"])
    finally:
        await client.aclose()


async def consume_refresh_token(token: str) -> bool:
    from jwt.exceptions import InvalidTokenError

    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],
        )
    except InvalidTokenError:
        return False

    if (
        payload.get("type") != "refresh"
        or not payload.get("jti")
        or not payload.get("sub")
    ):
        return False

    client = redis.from_url(settings.redis_url, decode_responses=True)
    try:
        key = f"refresh_token:{payload['jti']}"
        stored_user = await client.execute_command("GETDEL", key)
        return stored_user == str(payload["sub"])
    finally:
        await client.aclose()
