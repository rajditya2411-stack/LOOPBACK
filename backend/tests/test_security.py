from fastapi import Response
import pytest
from httpx import ASGITransport, AsyncClient

from app.api.auth import set_auth_cookies
from app.core.config import settings
from app.core.security import create_access_token, decode_token, hash_password, verify_password
from app.main import app


def test_password_hashing_round_trip() -> None:
    password = "SuperSecret123!"
    hashed = hash_password(password)
    assert verify_password(password, hashed) is True
    assert verify_password("wrong-password", hashed) is False


def test_access_token_round_trip() -> None:
    token = create_access_token({"sub": "user-123"}, expires_delta=None)
    payload = decode_token(token)
    assert payload["sub"] == "user-123"
    assert payload["type"] == "access"


@pytest.mark.asyncio
async def test_health_response_has_baseline_security_headers() -> None:
    """The API should return security headers even for unauthenticated routes."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/health")

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"


def test_private_upload_directory_is_not_mounted_as_public_static_files() -> None:
    assert all(not route.path.startswith("/uploads") for route in app.routes)


def test_browser_tokens_are_http_only_and_csrf_cookie_is_readable() -> None:
    response = Response()
    set_auth_cookies(response, {"access_token": "access", "refresh_token": "refresh", "token_type": "bearer"})
    cookies = response.headers.getlist("set-cookie")

    access_cookie = next(cookie for cookie in cookies if cookie.startswith("loopback_access_token="))
    refresh_cookie = next(cookie for cookie in cookies if cookie.startswith("loopback_refresh_token="))
    csrf_cookie = next(cookie for cookie in cookies if cookie.startswith("loopback_csrf_token="))
    assert "HttpOnly" in access_cookie
    assert "HttpOnly" in refresh_cookie
    assert "HttpOnly" not in csrf_cookie


def test_cookie_security_can_be_explicit_for_local_http(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "debug", False)
    monkeypatch.setattr(settings, "auth_cookie_secure", False)
    response = Response()
    set_auth_cookies(response, {"access_token": "access", "refresh_token": "refresh", "token_type": "bearer"})

    assert "Secure" not in response.headers.getlist("set-cookie")[0]


@pytest.mark.asyncio
async def test_cookie_authenticated_write_requires_csrf_header() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        client.cookies.set("loopback_access_token", "not-a-real-token")
        client.cookies.set("loopback_csrf_token", "csrf-value")
        response = await client.post("/api/auth/logout")

    assert response.status_code == 403
