"""Pydantic schemas for User."""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    """Schema for user registration."""

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)


class UserLogin(BaseModel):
    """Schema for user login."""

    email: EmailStr
    password: str


class UserRead(BaseModel):
    """Schema for returning user data."""

    id: str
    email: str
    full_name: str
    avatar_url: str | None = None
    bio: str | None = None
    is_active: bool
    is_verified: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    """Schema for updating user profile."""

    full_name: str | None = Field(None, min_length=1, max_length=255)
    bio: str | None = None
    avatar_url: str | None = None


class PasswordChange(BaseModel):
    """Schema for changing password."""

    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class PasswordResetRequest(BaseModel):
    """Schema for requesting a password reset."""

    email: EmailStr


class PasswordReset(BaseModel):
    """Schema for completing a password reset."""

    token: str
    new_password: str = Field(min_length=8, max_length=128)


class TokenPair(BaseModel):
    """JWT token pair returned on login/refresh."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefresh(BaseModel):
    """Schema for refresh token request."""

    refresh_token: str
