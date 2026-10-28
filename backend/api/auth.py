from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from core.security import hash_password
from models.user import User
from schemas.auth import UserRegister, UserResponse

router = APIRouter(prefix='/auth', tags=['auth'])


@router.post('/register', response_model=UserResponse, status_code=status.HTTP_201_CREATED)
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
