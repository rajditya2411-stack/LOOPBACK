"""Authentication business logic for the FastAPI backend."""

from __future__ import annotations

import logging
from datetime import timedelta

from fastapi import HTTPException, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.settings import UserSettings
from app.models.user import User
from app.schemas.user import PasswordReset, TokenRefresh, UserCreate, UserLogin
from app.services.email_service import send_password_reset_email

logger = logging.getLogger(__name__)


async def register_user(db: AsyncSession, data: UserCreate) -> User:
    """Register a new user and create default settings."""
    normalized_email = str(data.email).strip().lower()
    existing_user = await db.scalar(select(User).where(User.email == normalized_email))
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    user = User(
        email=normalized_email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name.strip(),
    )
    db.add(user)
    await db.flush()

    db.add(UserSettings(user_id=user.id))
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(db: AsyncSession, data: UserLogin) -> dict[str, str]:
    """Authenticate a user and issue JWT tokens."""
    normalized_email = str(data.email).strip().lower()
    result = await db.execute(select(User).where(User.email == normalized_email))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    return {
        "access_token": create_access_token({"sub": user.id}),
        "refresh_token": create_refresh_token({"sub": user.id}),
        "token_type": "bearer",
    }


async def refresh_user_tokens(db: AsyncSession, data: TokenRefresh) -> dict[str, str]:
    """Issue a new access token pair from a valid refresh token."""
    try:
        payload = decode_token(data.refresh_token)
    except (JWTError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        ) from exc

    if payload.get("type") != "refresh" or not isinstance(payload.get("sub"), str):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    user_id = payload["sub"]
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated",
        )

    return {
        "access_token": create_access_token({"sub": user.id}),
        "refresh_token": create_refresh_token({"sub": user.id}),
        "token_type": "bearer",
    }


async def request_password_reset(db: AsyncSession, email: str) -> bool:
    """Create a password reset token without leaking it to the client or logs."""
    normalized_email = str(email).strip().lower()
    result = await db.execute(select(User).where(User.email == normalized_email))
    user = result.scalar_one_or_none()
    if user is None:
        return False

    reset_token = create_access_token(
        {"sub": user.id, "purpose": "reset"},
        expires_delta=timedelta(minutes=15),
    )
    await send_password_reset_email(user.email, reset_token)
    logger.info("Password reset email queued", extra={"user_id": user.id})
    return True


async def reset_password(db: AsyncSession, data: PasswordReset) -> bool:
    """Complete password reset flow using a valid token."""
    try:
        payload = decode_token(data.token)
    except (JWTError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        ) from exc

    if payload.get("purpose") != "reset" or not isinstance(payload.get("sub"), str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid token purpose",
        )

    user_id = payload["sub"]
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User not found or deactivated",
        )

    user.hashed_password = hash_password(data.new_password)
    await db.commit()
    return True
