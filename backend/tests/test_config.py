"""Configuration loading tests for secure local development."""

from pathlib import Path

from app.core.config import Settings


def test_settings_loads_the_prefixed_local_env_file(tmp_path, monkeypatch) -> None:
    env_file = tmp_path / ".env"
    example = (Path(__file__).resolve().parents[1] / ".env.example").read_text(encoding="utf-8")
    env_file.write_text(
        example.replace(
            "LOOPBACK_JWT_SECRET_KEY=",
            "LOOPBACK_JWT_SECRET_KEY=local-development-secret-with-at-least-32-characters",
            1,
        ),
        encoding="utf-8",
    )

    # Environment variables intentionally have higher precedence, so remove
    # the test-suite default while validating the local-file source itself.
    monkeypatch.delenv("LOOPBACK_JWT_SECRET_KEY")
    settings = Settings(_env_file=env_file)

    assert settings.jwt_secret_key == "local-development-secret-with-at-least-32-characters"
    assert settings.database_url == "sqlite+aiosqlite:///./loopback.db"
    assert settings.model_config["env_file"] == ".env"
    assert settings.model_config["env_prefix"] == "LOOPBACK_"
