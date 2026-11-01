"""One-time role promotion via trusted backend environment only.

Usage (Render Shell or trusted backend container):
  python -m scripts.grant_developer --email user@example.com --confirm

Never expose this operation as a public HTTP endpoint.
"""
import argparse
import asyncio

from sqlalchemy import select, func

from core.database import AsyncSessionLocal
from models.user import User


async def grant_developer(email: str, confirm: bool) -> None:
    normalized = email.strip().lower()
    if not normalized or "@" not in normalized:
        raise ValueError("A valid account email is required")
    if not confirm:
        raise ValueError("Explicit --confirm is required")

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(func.lower(func.trim(User.email)) == normalized))
        user = result.scalar_one_or_none()
        if user is None:
            raise ValueError("Account not found; no changes made")
        if not user.is_active:
            raise ValueError("Inactive account; no changes made")
        if user.role == "admin":
            print("Account already admin; no changes made")
            return
        if user.role == "developer":
            print("Account already developer; no changes made")
            return
        if user.role != "viewer":
            raise ValueError("Unexpected role; no changes made")
        user.role = "developer"
        await db.commit()
        print("Developer role assigned to the selected active account")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--confirm", action="store_true")
    args = parser.parse_args()
    asyncio.run(grant_developer(args.email, args.confirm))
