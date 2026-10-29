from core.sessions import consume_refresh_token
from core.sessions import is_refresh_token_active, revoke_refresh_token
from schemas.auth import RefreshTokenRequest
from jose import JWTError
from core.sessions import save_refresh_token
from core.security import create_refresh_token
from core.rate_limit import rate_limit
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from core.security import hash_password
from models.user import User
from schemas.auth import UserRegister, UserResponse

router = APIRouter(prefix='/auth', tags=['auth'])


@router.post('/register', response_model=UserResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(rate_limit(3))])
async def register(data: UserRegister, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail='Email already registered')

    user = User(email=data.email, hashed_password=hash_password(data.password))
    db.add(user)
    try:
        await db.commit()
        await db.refresh(user)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail='Email already registered')
    return user


from schemas.auth import UserLogin, TokenResponse
from core.security import verify_password, create_access_token


@router.post('/login', response_model=TokenResponse, dependencies=[Depends(rate_limit(5))])
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    email = data.email.strip().lower()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail='Invalid email or password')
    if not user.is_active:
        raise HTTPException(status_code=403, detail='Account disabled')
    token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)
    await save_refresh_token(refresh_token)
    return TokenResponse(
        access_token=token,
        refresh_token=refresh_token,
    )
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from core.config import settings

bearer_scheme = HTTPBearer()


@router.get('/me', response_model=UserResponse)
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.secret_key,
            algorithms=[settings.algorithm],
        )

        if payload.get("type") != "access":
            raise JWTError("Invalid token type")

        user_id = payload.get("sub")
        if not user_id:
            raise JWTError("Missing user ID")

    except JWTError:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=401,
            detail="User not found or inactive",
        )

    return user

@router.post("/refresh", response_model=TokenResponse)
async def refresh_access_token(
    data: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        payload = jwt.decode(
            data.refresh_token,
            settings.secret_key,
            algorithms=[settings.algorithm],
        )
        if payload.get("type") != "refresh":
            raise JWTError("Invalid token type")

        user_id = payload.get("sub")
        jti = payload.get("jti")
        if not user_id or not jti:
            raise JWTError("Missing token claims")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if not await consume_refresh_token(data.refresh_token):
        raise HTTPException(status_code=401, detail="Refresh token revoked or already used")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Account unavailable")

    await revoke_refresh_token(jti)

    new_refresh = create_refresh_token(user.id)
    await save_refresh_token(new_refresh)

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=new_refresh,
    )


@router.post("/logout")
async def logout(data: RefreshTokenRequest):
    try:
        payload = jwt.decode(
            data.refresh_token,
            settings.secret_key,
            algorithms=[settings.algorithm],
        )

        if (
            payload.get("type") != "refresh"
            or not payload.get("jti")
        ):
            raise JWTError("Invalid refresh token")

    except JWTError:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired refresh token",
        )

    await revoke_refresh_token(payload["jti"])
    return {"message": "Logged out successfully"}
