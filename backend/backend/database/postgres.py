"""
PostgreSQL async engine and session factory.
All database access in the backend goes through get_db() dependency.
"""

from collections.abc import AsyncGenerator
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from backend.config import settings

logger = structlog.get_logger(__name__)


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


# Module-level engine and session factory — created once at startup
_engine: AsyncEngine | None = None
_async_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    """Return the module-level async engine (created lazily)."""
    global _engine
    if _engine is None:
        _engine = create_async_engine(
            settings.POSTGRES_URL,
            echo=settings.ENVIRONMENT == "development",
            pool_size=10,
            max_overflow=20,
            pool_pre_ping=True,
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return the module-level async session factory."""
    global _async_session_factory
    if _async_session_factory is None:
        _async_session_factory = async_sessionmaker(
            bind=get_engine(),
            expire_on_commit=False,
            autoflush=False,
            autocommit=False,
        )
    return _async_session_factory


async def get_db() -> AsyncGenerator[AsyncSession, Any]:
    """
    FastAPI dependency that yields an AsyncSession per request.
    Commits on success, rolls back on exception.
    """
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def create_all_tables() -> None:
    """Create all SQLAlchemy ORM tables. Called during app startup."""
    # Import models so they are registered with Base.metadata
    import backend.models.tables  # noqa: F401

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("database.tables_created")


async def close_engine() -> None:
    """Dispose the engine connection pool. Called during app shutdown."""
    global _engine
    if _engine is not None:
        await _engine.dispose()
        _engine = None
    logger.info("database.engine_closed")
