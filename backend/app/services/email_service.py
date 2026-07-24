"""Password-reset mail delivery with a safe local-development outbox."""

from __future__ import annotations

import asyncio
import smtplib
from email.message import EmailMessage
from pathlib import Path

from app.core.config import settings


async def send_password_reset_email(email: str, token: str) -> None:
    """Deliver a reset link through SMTP or record it in a local-only outbox."""
    reset_link = f"{settings.frontend_url.rstrip('/')}/reset-password?token={token}"
    message = EmailMessage()
    message["Subject"] = "Reset your LoopBack password"
    message["From"] = settings.smtp_from_email
    message["To"] = email
    message.set_content(f"Use this link to reset your password (valid for 15 minutes):\n{reset_link}")
    if not settings.smtp_host:
        outbox = settings.upload_path / "outbox"
        outbox.mkdir(parents=True, exist_ok=True)
        (outbox / f"password-reset-{token[:12]}.eml").write_bytes(message.as_bytes())
        return

    def deliver() -> None:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            if settings.smtp_use_tls:
                server.starttls()
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)

    await asyncio.to_thread(deliver)


async def send_workspace_invitation_email(email: str, workspace_name: str, accept_url: str) -> None:
    """Deliver a workspace invitation through SMTP or the local development outbox."""
    message = EmailMessage()
    message["Subject"] = f"You're invited to {workspace_name} on LoopBack"
    message["From"] = settings.smtp_from_email
    message["To"] = email
    message.set_content(
        f"You've been invited to collaborate in the LoopBack workspace '{workspace_name}'.\n\n"
        f"Accept the invitation (valid for seven days):\n{accept_url}"
    )
    if not settings.smtp_host:
        outbox = settings.upload_path / "outbox"
        outbox.mkdir(parents=True, exist_ok=True)
        safe_name = "".join(character for character in workspace_name if character.isalnum() or character in "-_")[:24] or "workspace"
        (outbox / f"workspace-invite-{safe_name}.eml").write_bytes(message.as_bytes())
        return

    def deliver() -> None:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            if settings.smtp_use_tls:
                server.starttls()
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)

    await asyncio.to_thread(deliver)
