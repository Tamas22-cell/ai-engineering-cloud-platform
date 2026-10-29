from fastapi import APIRouter, Depends
from models.user import User
from core.rbac import require_role

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/dashboard")
async def admin_dashboard(
    user: User = Depends(require_role("admin")),
):
    return {
        "status": "ok",
        "message": "Admin access granted",
        "role": user.role,
    }
