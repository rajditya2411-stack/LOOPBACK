"""LoopBack application configuration via Pydantic Settings."""

from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        # A generic DEBUG variable is frequently set by Windows developer
        # tooling.  Keeping all application configuration in its own
        # namespace prevents unrelated process variables from breaking
        # startup (for example, DEBUG=release).
        env_prefix="LOOPBACK_",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "LoopBack"
    app_version: str = "0.1.0"
"""LoopBack application configuration via Pydantic Settings."""

from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        # A generic DEBUG variable is frequently set by Windows developer
        # tooling.  Keeping all application configuration in its own
        # namespace prevents unrelated process variables from breaking
        # startup (for example, DEBUG=release).
        env_prefix="LOOPBACK_",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "LoopBack"
    app_version: str = "0.1.0"
    debug: bool = False

    database_url: str = "sqlite+aiosqlite:///./loopback.db"

    # Provide a default for local setups so fresh clones start out-of-the-box
    jwt_secret_key: str = Field(default="loopback-default-local-development-secret-key-change-in-prod-32chars", min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    # None preserves the safe default: cookies are Secure outside debug mode.
    # Local HTTP container setups may explicitly opt out without making a
    # production deployment accidentally accept insecure cookies.
    auth_cookie_secure: bool | None = None

    # Only non-secret local runtime configuration belongs here. AI credentials
    # are per-user BYOK settings in SQLite, never developer environment keys.
    ai_provider: str = "gemini"
    gemini_api_key: str = ""
    xai_api_key: str = ""
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    kimi_api_key: str = ""
    ai_model: str = "gemini-2.5-flash"
    ai_embedding_model: str = "gemini-embedding-001"
    # Keep Chroma's active index compatible with the prior 1024-dimension
    # collection while allowing the provider to explicitly control output size.
    ai_embedding_dimensions: int = Field(default=1024, ge=128, le=3072)

    upload_dir: str = "uploads"
    max_upload_size_mb: int = 50
    chroma_persist_dir: str = "chroma"
    document_chunk_size: int = 1_200
    document_chunk_overlap: int = 200
    rag_max_chunks: int = Field(default=4, ge=1, le=50)
    rag_max_context_chars: int = Field(default=12_000, ge=100)
    rag_max_context_tokens: int = Field(default=3_000, ge=50)
    rag_min_relevance: float = Field(default=0.15, ge=-1, le=1)
    chat_max_history_messages: int = Field(default=20, ge=1, le=100)
    chat_max_history_tokens: int = Field(default=4_000, ge=100)
    chat_stream_timeout_seconds: float = Field(default=60.0, ge=5, le=300)
    workspace_context_max_chars: int = Field(default=6_000, ge=500)
    workspace_context_max_items: int = Field(default=12, ge=1, le=50)
    memory_extraction_max_items: int = Field(default=5, ge=1, le=10)
    memory_extraction_min_confidence: float = Field(default=0.7, ge=0, le=1)
    memory_extraction_max_turn_chars: int = Field(default=8_000, ge=500, le=50_000)
    memory_extraction_max_attempts: int = Field(default=3, ge=1, le=5)
    memory_extraction_retry_delay_seconds: float = Field(default=1.0, ge=0.1, le=30)
    memory_duplicate_similarity: float = Field(default=0.92, ge=0, le=1)
    memory_rank_semantic_weight: float = Field(default=0.55, ge=0, le=1)
    memory_rank_pin_weight: float = Field(default=0.15, ge=0, le=1)
    memory_rank_confidence_weight: float = Field(default=0.15, ge=0, le=1)
    memory_rank_recency_weight: float = Field(default=0.10, ge=0, le=1)
    memory_rank_usage_weight: float = Field(default=0.05, ge=0, le=1)
    memory_rank_recency_days: float = Field(default=30.0, gt=0)
    memory_rank_usage_saturation: int = Field(default=10, ge=1)
    rag_citation_snippet_chars: int = Field(default=320, ge=80, le=1_000)

    # Set SMTP_HOST to enable delivery. Without it, reset links are written to a
    # local outbox file so development remains testable without leaking tokens.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "noreply@loopback.local"
    smtp_use_tls: bool = True

    frontend_url: str = "http://localhost:3000"
    # Override this with a JSON list only when more than one frontend origin is
    # needed. By default the single configured frontend URL is the CORS origin.
    cors_allow_origins: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def use_frontend_url_for_cors_by_default(self) -> "Settings":
        """Keep the default CORS policy narrow and deployment-friendly."""
        default_origins = [
            self.frontend_url.rstrip("/"),
            "http://localhost:3010",
            "http://localhost:3000",
            "http://127.0.0.1:3010",
            "http://127.0.0.1:3000",
        ]
        if not self.cors_allow_origins:
            self.cors_allow_origins = default_origins
        else:
            for origin in default_origins:
                if origin not in self.cors_allow_origins:
                    self.cors_allow_origins.append(origin)
        return self

    @property
    def upload_path(self) -> Path:
        """Resolved upload directory path."""
        path = Path(self.upload_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def max_upload_size_bytes(self) -> int:
        """Maximum upload size in bytes."""
        return self.max_upload_size_mb * 1024 * 1024

    @property
    def chroma_path(self) -> Path:
        """Resolved ChromaDB persistence directory."""
        path = Path(self.chroma_persist_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def ai_provider_configured(self) -> bool:
        """Whether credentials for the selected provider are safe to use."""
        provider = self.ai_provider.strip().lower()
        key_map = {
            "gemini": self.gemini_api_key,
            "xai": self.xai_api_key,
            "grok": self.xai_api_key,
            "openai": self.openai_api_key,
            "anthropic": self.anthropic_api_key,
            "claude": self.anthropic_api_key,
            "kimi": self.kimi_api_key,
        }
        value = key_map.get(provider, "").strip()
        return bool(value) and not value.lower().startswith(("your-", "replace-", "changeme"))

    @property
    def ai_provider_configuration_error(self) -> str:
        """Return an actionable, non-secret reason when AI is unavailable."""
        provider = self.ai_provider.strip().lower()
        if provider in {"gemini", "xai", "grok", "openai", "anthropic", "claude", "kimi"}:
            return f"{provider.capitalize()} is selected as default server provider, but no server key is configured. Please configure your API key in Settings."
        elif not provider:
            return "No AI provider is selected. Configure a provider in AI Configuration Center."
        else:
            return f"Unsupported AI provider: {provider}."
        return "The configured AI provider is unavailable."

    @property
    def secure_auth_cookies(self) -> bool:
        """Whether browser authentication cookies require HTTPS transport."""
        if self.auth_cookie_secure is not None:
            return self.auth_cookie_secure
        return not self.debug

settings = Settings()
