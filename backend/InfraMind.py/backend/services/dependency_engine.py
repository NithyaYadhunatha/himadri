"""
Dependency Engine — service layer over GraphService for managing asset
relationships (e.g. a heater DEPENDS_ON a generator, a generator USES a fuel
tank). All Neo4j access goes through graph_service (never raw Cypher here).
"""

from __future__ import annotations

import re
from typing import Any

import structlog

from backend.database.neo4j_client import graph_service
from backend.schemas.schemas import BlastRadius, DependencyAsset

logger = structlog.get_logger(__name__)


async def register_asset_in_graph(
    asset_id: str,
    name: str,
    category: str,
    station_id: str,
    status: str = "offline",
    health_score: float = 100.0,
) -> None:
    """Register a new asset in Neo4j. Called on device/asset registration."""
    await graph_service.register_asset(
        asset_id=asset_id,
        name=name,
        category=category,
        station_id=station_id,
        status=status,
        health_score=health_score,
    )
    logger.info("dependency_engine.asset_registered", asset_id=asset_id, category=category)


async def update_asset_in_graph(
    asset_id: str,
    status: str,
    health_score: float,
    name: str | None = None,
    category: str | None = None,
    station_id: str | None = None,
) -> None:
    """Update asset status/health in Neo4j. If name/category/station_id are
    provided, upserts the full asset so the graph stays in sync — otherwise
    falls back to a status-only update."""
    if name is not None and category is not None and station_id is not None:
        await graph_service.register_asset(
            asset_id=asset_id,
            name=name,
            category=category,
            station_id=station_id,
            status=status,
            health_score=health_score,
        )
    else:
        await graph_service.update_asset_status(
            asset_id=asset_id,
            status=status,
            health_score=health_score,
        )


async def get_asset_dependencies(asset_id: str) -> list[DependencyAsset]:
    """Return direct dependencies of an asset (what it DEPENDS_ON/USES)."""
    raw = await graph_service.get_dependencies(asset_id)
    return [
        DependencyAsset(
            asset_id=r["asset_id"],
            name=r["name"],
            category=r["category"],
            status=r["status"] or "unknown",
            health_score=r["health_score"] or 0.0,
            relationship=r.get("relationship"),
        )
        for r in raw
    ]


async def get_blast_radius(asset_id: str) -> BlastRadius:
    """
    Compute the blast radius if this asset fails — every asset that would be
    impacted, ordered by proximity. Backs both the What-If Scenario engine
    and the Antarctic Risk Heatmap's "affects downstream systems" evidence.
    """
    raw = await graph_service.get_blast_radius(asset_id)
    affected_assets = [
        DependencyAsset(
            asset_id=r["asset_id"],
            name=r["name"],
            category=r["category"],
            status=r["status"] or "unknown",
            health_score=r["health_score"] or 0.0,
            depth=r.get("depth"),
        )
        for r in raw
    ]
    return BlastRadius(
        origin_asset_id=asset_id,
        affected_count=len(affected_assets),
        affected_assets=affected_assets,
    )


def normalize_relationship_type(rel_type: str) -> str:
    """
    Coerce a user-typed relationship type (e.g. the frontend Add Edge modal's
    free-text "custom type" field) into the UPPER_SNAKE_CASE shape
    graph_service.add_relationship requires.
    """
    return re.sub(r"[^A-Z0-9]+", "_", rel_type.strip().upper()).strip("_")


async def add_relationship(from_id: str, to_id: str, rel_type: str) -> None:
    """Add a directed relationship between two assets. rel_type is normalized
    to UPPER_SNAKE_CASE before graph_service's stricter validation."""
    await graph_service.add_relationship(from_id, to_id, normalize_relationship_type(rel_type))


async def remove_relationship(from_id: str, to_id: str) -> None:
    """Remove any relationship(s) directly between these two assets."""
    await graph_service.remove_relationship(from_id, to_id)


async def get_full_twin_graph(station_id: str | None = None) -> dict[str, Any]:
    """Return the full asset graph for the 2D twin / floor-plan visualization."""
    return await graph_service.get_full_graph(station_id)


async def get_dependents_count(asset_id: str) -> int:
    """Return how many assets depend (directly or indirectly) on this asset."""
    return await graph_service.get_dependents_count(asset_id)


async def delete_asset_from_graph(asset_id: str) -> None:
    """Delete an asset and all its relationships from the graph."""
    await graph_service.remove_asset(asset_id)
    logger.info("dependency_engine.asset_deleted", asset_id=asset_id)
