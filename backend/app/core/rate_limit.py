"""Small dependency-free rate limiter for public authentication endpoints."""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

_attempts: dict[str, deque[float]] = defaultdict(deque)


async def limit_auth_attempts(request: Request) -> None:
    """Limit an IP to ten authentication attempts per minute."""
    key = request.client.host if request.client else "unknown"
    now = time.monotonic()
    attempts = _attempts[key]
    while attempts and now - attempts[0] > 60:
        attempts.popleft()
    if len(attempts) >= 10:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many attempts; try again shortly")
    attempts.append(now)
