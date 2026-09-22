"""
Shared FastAPI dependencies: authentication, rate limiting.
"""

from __future__ import annotations

import time
from collections import defaultdict

import structlog
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.config import settings
from backend.database.postgres import AsyncSession, get_db
from backend.models.tables import Asset
from sqlalchemy import select

logger = structlog.get_logger(__name__)

# ─── Bearer token auth (non-agent routes) ────────────────────────────────────

_bearer_scheme = HTTPBearer(auto_error=False)


async def require_bearer(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> None:
    """Validate Bearer token for non-agent routes."""
    if credentials is None or credentials.credentials != settings.API_SECRET_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing Bearer token. "
                   "Use: Authorization: Bearer <API_SECRET_KEY>",
        )


# ─── API key auth (agent routes) ─────────────────────────────────────────────

# Rate limiter: maps node_id → last_heartbeat_timestamp
_rate_limit_store: dict[str, float] = defaultdict(float)
RATE_LIMIT_SECONDS = 5


async def require_api_key(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    db: AsyncSession = Depends(get_db),
) -> Asset:
    """
    Validate X-API-Key header and return the corresponding Asset (device).
    Raises 401 if key is missing/invalid.
    """
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-API-Key header",
        )

    result = await db.execute(select(Asset).where(Asset.api_key == x_api_key))
    asset = result.scalar_one_or_none()

    if asset is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )

    return asset


async def require_api_key_rate_limited(
    asset: Asset = Depends(require_api_key),
) -> Asset:
    """
    Validate API key AND enforce rate limit (max 1 request per 5 seconds per device).
    """
    now = time.monotonic()
    last = _rate_limit_store[asset.id]

    if now - last < RATE_LIMIT_SECONDS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit: max 1 heartbeat per {RATE_LIMIT_SECONDS} seconds",
        )

    _rate_limit_store[asset.id] = now
    return asset
