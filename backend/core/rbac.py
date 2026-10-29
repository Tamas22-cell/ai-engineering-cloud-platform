from fastapi import Depends, HTTPException, status
from models.user import User
from core.dependencies import get_current_user

ROLES = {'admin', 'developer', 'viewer'}


def require_role(*allowed_roles: str):
    if not allowed_roles or set(allowed_roles) - ROLES:
        raise ValueError('Invalid allowed roles')

    async def dependency(user: User = Depends(get_current_user)):
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='Insufficient permissions',
            )
        return user

    return dependency
