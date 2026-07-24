import os
import secrets

# Tests import application modules during collection. Supply a non-production
# key there so the required runtime setting remains enforced in all real
# environments without requiring a tracked .env file.
os.environ.setdefault("LOOPBACK_JWT_SECRET_KEY", secrets.token_urlsafe(48))

from app.core.windows_asyncio import configure_windows_asyncio


configure_windows_asyncio()
