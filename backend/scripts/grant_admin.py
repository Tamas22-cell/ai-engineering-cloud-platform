"""One-time admin role promotion via trusted backend environment only.

Preferred usage (Render Shell or trusted backend container):
  python -m scripts.grant_admin --email account@example.com --confirm

For deployments without Shell, the application lifespan supports a narrowly
scoped temporary bootstrap using BOTH environment variables:
  ONE_TIME_ADMIN_EMAIL=account@example.com
  ONE_TIME_ADMIN_CONFIRM=YES

Remove those two environment variables immediately after the successful
startup/deployment. This operation is never exposed as a public HTTP endpoint.
"""
import argparse
import asyncio

from sqlalchemy import func, select

from core.audit import save_audit_event
from core.database import AsyncSessionLocal
from models.user import User


async def grant_admin(email: str, confirm: bool) -> None:
    normalized = email.strip().lower()
    if not normalized or "@" not in normalized:
        raise ValueError("A valid account email is required")
    if confirm is not True:
        raise ValueError("Explicit confirmation is required")

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User).where(func.lower(func.trim(User.email)) == normalized)
        )
        user = result.scalar_one_or_none()

        if user is None:
            raise ValueError("Account not found; no changes made")
        if not user.is_active:
            raise ValueError("Inactive account; no changes made")
        if user.role == "admin":
            print("Account already admin; no changes made")
            return
        if user.role not in {"viewer", "developer"}:
            raise ValueError("Unexpected role; no changes made")

        user.role = "admin"
        await db.commit()
        user_id = str(user.id)

    await save_audit_event(
        event_type="admin_role_granted_bootstrap",
        user_id=user_id,
    )
    print("Admin role assigned to the selected active account")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--confirm", action="store_true")
    args = parser.parse_args()
    asyncio.run(grant_admin(args.email, confirm=args.confirm))
