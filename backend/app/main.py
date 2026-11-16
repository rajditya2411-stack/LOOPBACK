"""LoopBack – FastAPI Application Entry Point."""

import asyncio
import hmac
import logging
from pathlib import Path
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text

from app.api.auth import router as auth_router
from app.api.users import router as users_router
from app.api.chat import router as chat_router
from app.core.config import settings
from app.database.session import engine

import app.models  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Prepare runtime directories and dispose resources on shutdown.

    Schema changes are deliberately not applied here. Deployments must run
    ``alembic upgrade head`` as a release step so migration failures cannot be
    hidden by an application startup side effect.
    """
    upload_base = settings.upload_path
    for subdir in ["documents", "images", "audio", "temp"]:
        (upload_base / subdir).mkdir(parents=True, exist_ok=True)

    # Reconcile persisted SQL chunks into the versioned Chroma collection
    # without making application readiness depend on a slow embedding provider.
    from app.services.document_service import (
        reconcile_document_indexes,
        repair_missing_document_sources,
    )

    await repair_missing_document_sources()
    reconciliation_task = asyncio.create_task(reconcile_document_indexes())

    try:
        yield
    finally:
        if not reconciliation_task.done():
            reconciliation_task.cancel()
        try:
            await reconciliation_task
        except asyncio.CancelledError:
            pass
        except Exception:
            logging.getLogger(__name__).exception("Document index reconciliation task failed")

        await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="AI-powered productivity workspace – Remember More. Work Smarter.",
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def csrf_protection_middleware(request: Request, call_next):
    """Require a matching CSRF header for cookie-authenticated API writes."""
    if request.method == "OPTIONS":
        return await call_next(request)
    exempt_paths = {
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/refresh",
        "/api/auth/forgot-password",
        "/api/auth/reset-password",
    }
    is_unsafe_api_request = request.method in {"POST", "PUT", "PATCH", "DELETE"} and request.url.path.startswith("/api/")
    uses_cookie_auth = bool(request.cookies.get("loopback_access_token")) and not request.headers.get("authorization")
    if is_unsafe_api_request and uses_cookie_auth and request.url.path not in exempt_paths:
        cookie_token = request.cookies.get("loopback_csrf_token", "")
        header_token = request.headers.get("x-csrf-token", "")
        if not cookie_token or not hmac.compare_digest(cookie_token, header_token):
            return JSONResponse(status_code=403, content={"detail": "CSRF validation failed"})
    return await call_next(request)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """Attach a request id and return JSON for unexpected failures."""
    if request.method == "OPTIONS":
        return await call_next(request)
    import logging
    import time
    from uuid import uuid4

    request_id = request.headers.get("x-request-id", str(uuid4()))
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        logging.getLogger("loopback.request").exception("request_failed", extra={"request_id": request_id})
        response = JSONResponse(
            status_code=500,
            content={"detail": "Internal server error", "request_id": request_id},
        )
        origin = request.headers.get("origin")
        if origin:
            response.headers["access-control-allow-origin"] = origin
            response.headers["access-control-allow-credentials"] = "true"
    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
    response.headers["x-request-id"] = request_id
    response.headers["x-content-type-options"] = "nosniff"
    response.headers["x-frame-options"] = "DENY"
    response.headers["referrer-policy"] = "strict-origin-when-cross-origin"
    response.headers["permissions-policy"] = "camera=(), microphone=(), geolocation=()"
    logging.getLogger("loopback.request").info(
        "request_complete", extra={"request_id": request_id, "status_code": response.status_code, "elapsed_ms": elapsed_ms}
    )
    return response


app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
from app.api.tasks import router as tasks_router
from app.api.goals import router as goals_router
from app.api.memory import router as memory_router
from app.api.analytics import router as analytics_router
from app.api.documents import router as documents_router
from app.api.search import router as search_router
from app.api.notifications import router as notifications_router
from app.api.workspaces import router as workspaces_router
from app.api.settings import router as settings_router
from app.api.productivity import router as productivity_router
from app.api.learning import router as learning_router

app.include_router(tasks_router, prefix="/api")
app.include_router(goals_router, prefix="/api")
app.include_router(memory_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(search_router, prefix="/api")
app.include_router(notifications_router, prefix="/api")
app.include_router(workspaces_router, prefix="/api")
app.include_router(settings_router, prefix="/api")
app.include_router(productivity_router, prefix="/api")
app.include_router(learning_router, prefix="/api")

@app.get("/api/health", tags=["Health"])
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "app": settings.app_name,
        "version": settings.app_version,
    }


@app.get("/api/health/ready", tags=["Health"])
async def readiness_check() -> JSONResponse:
    """Validate every dependency needed to serve the local application."""
    checks: dict[str, dict[str, object]] = {}

    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
            revision = await connection.scalar(text("SELECT version_num FROM alembic_version"))
        config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
        expected_revision = ScriptDirectory.from_config(config).get_current_head()
        checks["database"] = {"ok": True}
        checks["migrations"] = {
            "ok": revision == expected_revision,
            "current": revision,
            "expected": expected_revision,
        }
    except Exception as exc:
        checks["database"] = {"ok": False, "detail": str(exc)}
        checks["migrations"] = {"ok": False, "detail": "Could not verify migration state"}

    try:
        upload_path = settings.upload_path
        required_directories = [upload_path / name for name in ("documents", "images", "audio", "temp")]
        checks["uploads"] = {"ok": all(path.is_dir() for path in required_directories), "path": str(upload_path)}
    except Exception as exc:
        checks["uploads"] = {"ok": False, "detail": str(exc)}

    try:
        import chromadb

        chromadb.PersistentClient(path=str(settings.chroma_path)).heartbeat()
        checks["chroma"] = {"ok": True}
    except Exception as exc:
        checks["chroma"] = {"ok": False, "detail": str(exc)}

    provider_ok = settings.ai_provider_configured
    checks["ai_provider"] = {
        "ok": provider_ok,
        "provider": settings.ai_provider,
        "model": settings.ai_model,
        "detail": None if provider_ok else settings.ai_provider_configuration_error,
    }
    ready = all(bool(check["ok"]) for check in checks.values())
    return JSONResponse(
        status_code=200 if ready else 503,
        content={"status": "ready" if ready else "not_ready", "checks": checks},
    )
