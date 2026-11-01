"""RBAC regression tests: deny unauthorized roles and accept authorized roles."""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from core.rbac import require_role


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["viewer", "developer"])
async def test_admin_only_rejects_non_admin(role):
    check = require_role("admin")
    with pytest.raises(HTTPException) as exc:
        await check(user=SimpleNamespace(role=role))
    assert exc.value.status_code == 403
    assert exc.value.detail == "Insufficient permissions"


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["admin", "developer", "viewer"])
async def test_authorized_roles_are_accepted(role):
    check = require_role("admin", "developer", "viewer")
    user = SimpleNamespace(role=role)
    assert await check(user=user) is user


@pytest.mark.asyncio
async def test_viewer_cannot_access_developer_only():
    check = require_role("admin", "developer")
    with pytest.raises(HTTPException) as exc:
        await check(user=SimpleNamespace(role="viewer"))
    assert exc.value.status_code == 403


def test_invalid_role_configuration_is_rejected():
    with pytest.raises(ValueError):
        require_role("superuser")
    with pytest.raises(ValueError):
        require_role()
