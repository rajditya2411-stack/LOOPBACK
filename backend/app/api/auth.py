"""Authentication API endpoints."""

import secrets

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.rate_limit import limit_auth_attempts
from app.database.session import get_db
from app.models.user import User
from app.schemas.common import MessageResponse
from app.schemas.user import (
    PasswordReset,
    PasswordResetRequest,
    TokenPair,
    TokenRefresh,
    UserCreate,
    UserLogin,
    UserRead,
)
from app.services.auth_service import (
    authenticate_user,
    refresh_user_tokens,
    register_user,
    request_password_reset,
    reset_password,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

ACCESS_COOKIE = "loopback_access_token"
REFRESH_COOKIE = "loopback_refresh_token"
CSRF_COOKIE = "loopback_csrf_token"


def _cookie_options() -> dict[str, object]:
    """Return secure defaults for first-party browser session cookies."""
    from app.core.config import settings

    return {
        "httponly": True,
        "secure": settings.secure_auth_cookies,
        "samesite": "lax",
        "path": "/",
    }


def set_auth_cookies(response: Response, tokens: dict[str, str]) -> None:
    """Store browser tokens outside JavaScript access and issue a CSRF token."""
    from app.core.config import settings

    options = _cookie_options()
    response.set_cookie(
        ACCESS_COOKIE,
        tokens["access_token"],
        max_age=settings.access_token_expire_minutes * 60,
        **options,
    )
    response.set_cookie(
        REFRESH_COOKIE,
        tokens["refresh_token"],
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        **options,
    )
    # This value deliberately remains readable by the frontend so it can be
    # echoed in an unsafe request header; it is not an authentication secret.
    response.set_cookie(
        CSRF_COOKIE,
        secrets.token_urlsafe(32),
        httponly=False,
        secure=options["secure"],
        samesite="lax",
        path="/",
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
    )


def clear_auth_cookies(response: Response) -> None:
    """Expire browser session and CSRF cookies on logout."""
    options = _cookie_options()
    for cookie_name in (ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE):
        response.delete_cookie(cookie_name, path="/", samesite="lax", secure=options["secure"])


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(data: UserCreate, _: None = Depends(limit_auth_attempts), db: AsyncSession = Depends(get_db)) -> User:
    """Register a new user account."""
    return await register_user(db, data)


@router.post("/login", response_model=TokenPair)
async def login(
    data: UserLogin,
    response: Response,
    _: None = Depends(limit_auth_attempts),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Authenticate and issue secure browser cookies plus API tokens."""
    tokens = await authenticate_user(db, data)
    set_auth_cookies(response, tokens)
    return tokens


@router.post("/refresh", response_model=TokenPair)
async def refresh_token(
    request: Request,
    response: Response,
    data: TokenRefresh | None = None,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Refresh tokens from an API payload or secure browser cookie."""
    refresh_value = data.refresh_token if data is not None else request.cookies.get(REFRESH_COOKIE)
    tokens = await refresh_user_tokens(db, TokenRefresh(refresh_token=refresh_value or ""))
    set_auth_cookies(response, tokens)
    return tokens


@router.post("/logout", response_model=MessageResponse)
async def logout(
    response: Response,
    _current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Logout the current user and clear their browser session."""
    clear_auth_cookies(response)
    return {"message": "Successfully logged out"}


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(
    data: PasswordResetRequest,
    _: None = Depends(limit_auth_attempts),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Request a password reset email without disclosing account existence."""
    await request_password_reset(db, str(data.email))
    return {"message": "If an account with this email exists, a reset link has been sent"}


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password_endpoint(
    data: PasswordReset,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Complete a password reset using a valid token."""
    await reset_password(db, data)
    return {"message": "Password successfully reset"}
