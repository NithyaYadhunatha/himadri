"""
Neo4j driver wrapper and GraphService.
All Neo4j access MUST go through GraphService — never write raw Cypher in routes or other services.

Graph label: :Asset (an Antarctic station asset — generator, fuel tank,
freezer, vehicle, instrument...). Relationship types describe physical/
operational dependency, e.g. a heater DEPENDS_ON a generator, a generator
USES a fuel tank: DEPENDS_ON, PROTECTS, ROUTES_TO, USES, MONITORS (custom
types are accepted, normalized to UPPER_SNAKE_CASE by the service layer).
This powers the Antarctic Risk Heatmap and what-if blast-radius queries
("if this generator fails, what else is affected").
"""

from __future__ import annotations

import re
from typing import Any

# pyrefly: ignore [missing-import]
import structlog
# pyrefly: ignore [missing-import]
from neo4j import AsyncDriver, AsyncGraphDatabase, AsyncManagedTransaction

from backend.config import settings

logger = structlog.get_logger(__name__)

# Module-level driver — created once at startup
_driver: AsyncDriver | None = None

# Relationship types are interpolated into Cypher (the driver can only
# parameterize values, never identifiers/labels/rel-types), so any dynamic
# rel_type must be validated against this pattern first. Uppercase
# snake_case, starting with a letter (DEPENDS_ON, PROTECTS, ROUTES_TO, USES,
# MONITORS, ...), rejecting anything that could break out of `[:{rel_type}]`.
_REL_TYPE_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]{0,63}$")


class InvalidRelationshipType(ValueError):
    """Raised when a caller-supplied rel_type fails _REL_TYPE_PATTERN."""


def validate_relationship_type(rel_type: str) -> None:
    if not _REL_TYPE_PATTERN.match(rel_type):
        raise InvalidRelationshipType(
            f"Invalid relationship type {rel_type!r} — must be uppercase "
            "letters/digits/underscores, starting with a letter (max 64 chars)"
        )


def get_driver() -> AsyncDriver:
    """Return the module-level Neo4j async driver (created lazily)."""
    global _driver
    if _driver is None:
        _driver = AsyncGraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
            max_connection_pool_size=50,
        )
    return _driver


async def close_driver() -> None:
    """Close the Neo4j driver. Called during app shutdown."""
    global _driver
    if _driver is not None:
        await _driver.close()
        _driver = None
    logger.info("neo4j.driver_closed")


async def verify_connectivity() -> None:
    """Verify Neo4j is reachable. Called during app startup."""
    driver = get_driver()
    await driver.verify_connectivity()
    logger.info("neo4j.connectivity_verified")


# ─────────────────────────────────────────────────────────────────────────────
# GraphService — the ONLY class allowed to execute Cypher
# ─────────────────────────────────────────────────────────────────────────────


class GraphService:
    """All graph operations go through this class."""

    # ── Asset management ────────────────────────────────────────────────────

    async def register_asset(
        self,
        asset_id: str,
        name: str,
        category: str,
        station_id: str,
        status: str = "offline",
        health_score: float = 100.0,
    ) -> None:
        """Create or update an asset node in the graph."""
        driver = get_driver()
        async with driver.session() as session:
            await session.execute_write(
                self._create_asset_tx,
                asset_id,
                name,
                category,
                station_id,
                status,
                health_score,
            )
        logger.info("graph.asset_registered", asset_id=asset_id, category=category)

    @staticmethod
    async def _create_asset_tx(
        tx: AsyncManagedTransaction,
        asset_id: str,
        name: str,
        category: str,
        station_id: str,
        status: str,
        health_score: float,
    ) -> None:
        query = """
        MERGE (n:Asset {asset_id: $asset_id})
        SET n.name = $name,
            n.category = $category,
            n.station_id = $station_id,
            n.status = $status,
            n.health_score = $health_score,
            n.updated_at = datetime()
        """
        await tx.run(
            query,
            asset_id=asset_id,
            name=name,
            category=category,
            station_id=station_id,
            status=status,
            health_score=health_score,
        )

    async def update_asset_status(
        self,
        asset_id: str,
        status: str,
        health_score: float,
    ) -> None:
        """Update status and health_score for an existing asset."""
        driver = get_driver()
        async with driver.session() as session:
            await session.execute_write(
                self._update_status_tx, asset_id, status, health_score
            )

    @staticmethod
    async def _update_status_tx(
        tx: AsyncManagedTransaction,
        asset_id: str,
        status: str,
        health_score: float,
    ) -> None:
        query = """
        MATCH (n:Asset {asset_id: $asset_id})
        SET n.status = $status,
            n.health_score = $health_score,
            n.updated_at = datetime()
        """
        await tx.run(query, asset_id=asset_id, status=status, health_score=health_score)

    # ── Relationship management ───────────────────────────────────────────────

    async def add_relationship(
        self,
        from_id: str,
        to_id: str,
        rel_type: str,
    ) -> None:
        """
        Add a directed relationship between two assets.
        rel_type examples: DEPENDS_ON, PROTECTS, ROUTES_TO, USES, MONITORS
        (e.g. heater-01 DEPENDS_ON generator-01, generator-01 USES fuel-tank-07)

        Cypher relationship types can't be sent as query parameters (the
        driver only parameterizes values, not identifiers), so rel_type is
        validated with a strict allowlist pattern before being interpolated
        into the query string below — this is the standard way to guard
        against Cypher injection when the relationship type itself is
        dynamic/user-supplied, not a substitute for parameterizing from_id/
        to_id (which still go through $from_id/$to_id as real parameters).
        """
        validate_relationship_type(rel_type)
        driver = get_driver()
        async with driver.session() as session:
            await session.execute_write(
                self._add_relationship_tx, from_id, to_id, rel_type
            )
        logger.info(
            "graph.relationship_added",
            from_id=from_id,
            to_id=to_id,
            rel_type=rel_type,
        )

    @staticmethod
    async def _add_relationship_tx(
        tx: AsyncManagedTransaction,
        from_id: str,
        to_id: str,
        rel_type: str,
    ) -> None:
        query = f"""
        MATCH (a:Asset {{asset_id: $from_id}})
        MATCH (b:Asset {{asset_id: $to_id}})
        MERGE (a)-[:{rel_type}]->(b)
        """
        await tx.run(query, from_id=from_id, to_id=to_id)

    async def remove_relationship(self, from_id: str, to_id: str) -> None:
        """Remove every relationship directly between these two assets (either
        direction), regardless of type — mirrors add_relationship's directed
        MERGE, but a UI "remove edge" action doesn't know/care which rel_type
        it created, so this clears the pair rather than requiring one back."""
        driver = get_driver()
        async with driver.session() as session:
            await session.execute_write(
                self._remove_relationship_tx, from_id, to_id
            )
        logger.info("graph.relationship_removed", from_id=from_id, to_id=to_id)

    @staticmethod
    async def _remove_relationship_tx(
        tx: AsyncManagedTransaction,
        from_id: str,
        to_id: str,
    ) -> None:
        query = """
        MATCH (a:Asset {asset_id: $from_id})-[r]-(b:Asset {asset_id: $to_id})
        DELETE r
        """
        await tx.run(query, from_id=from_id, to_id=to_id)

    # ── Dependency queries ────────────────────────────────────────────────────

    async def get_dependencies(self, asset_id: str) -> list[dict[str, Any]]:
        """
        Return all assets that the given asset directly depends on.
        (i.e. assets reachable via outgoing relationships)
        """
        driver = get_driver()
        async with driver.session() as session:
            result = await session.execute_read(
                self._get_dependencies_tx, asset_id
            )
        return result

    @staticmethod
    async def _get_dependencies_tx(
        tx: AsyncManagedTransaction, asset_id: str
    ) -> list[dict[str, Any]]:
        query = """
        MATCH (n:Asset {asset_id: $asset_id})-[r]->(dep:Asset)
        RETURN dep.asset_id AS asset_id,
               dep.name AS name,
               dep.category AS category,
               dep.status AS status,
               dep.health_score AS health_score,
               type(r) AS relationship
        """
        result = await tx.run(query, asset_id=asset_id)
        return [dict(record) async for record in result]

    async def get_blast_radius(self, asset_id: str) -> list[dict[str, Any]]:
        """
        Traverse the graph to find ALL assets that would be impacted
        if the given asset fails (i.e. assets that have a path leading
        to asset_id through any relationship type — used by the What-If
        Scenario engine and the Antarctic Risk Heatmap).
        Returns list of affected asset dicts, ordered by depth (closest first).
        """
        driver = get_driver()
        async with driver.session() as session:
            result = await session.execute_read(
                self._get_blast_radius_tx, asset_id
            )
        return result

    @staticmethod
    async def _get_blast_radius_tx(
        tx: AsyncManagedTransaction, asset_id: str
    ) -> list[dict[str, Any]]:
        query = """
        MATCH (origin:Asset {asset_id: $asset_id})
        MATCH (affected:Asset)-[*1..10]->(origin)
        WHERE affected.asset_id <> $asset_id
        WITH DISTINCT affected,
             length(shortestPath((affected)-[*]->(origin))) AS depth
        RETURN affected.asset_id AS asset_id,
               affected.name AS name,
               affected.category AS category,
               affected.status AS status,
               affected.health_score AS health_score,
               depth
        ORDER BY depth ASC
        """
        result = await tx.run(query, asset_id=asset_id)
        return [dict(record) async for record in result]

    # ── Full graph ────────────────────────────────────────────────────────────

    async def get_full_graph(self, station_id: str | None = None) -> dict[str, Any]:
        """
        Return all assets and all relationships for frontend visualization
        (optionally scoped to one station).
        Format: { nodes: [...], edges: [...] }
        """
        driver = get_driver()
        async with driver.session() as session:
            nodes, edges = await session.execute_read(self._get_full_graph_tx, station_id)
        return {"nodes": nodes, "edges": edges}

    @staticmethod
    async def _get_full_graph_tx(
        tx: AsyncManagedTransaction, station_id: str | None
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        nodes_query = """
        MATCH (n:Asset)
        WHERE $station_id IS NULL OR n.station_id = $station_id
        RETURN n.asset_id AS asset_id,
               n.name AS name,
               n.category AS category,
               n.station_id AS station_id,
               n.status AS status,
               n.health_score AS health_score,
               n.zone_id AS zone_id
        """
        edges_query = """
        MATCH (a:Asset)-[r]->(b:Asset)
        WHERE $station_id IS NULL OR (a.station_id = $station_id AND b.station_id = $station_id)
        RETURN a.asset_id AS source,
               b.asset_id AS target,
               type(r) AS relationship
        """
        nodes_result = await tx.run(nodes_query, station_id=station_id)
        nodes = [dict(record) async for record in nodes_result]

        edges_result = await tx.run(edges_query, station_id=station_id)
        edges = [dict(record) async for record in edges_result]

        return nodes, edges

    # ── Upstream dependents (how many assets rely on this asset) ─────────────

    async def get_dependents_count(self, asset_id: str) -> int:
        """Return how many assets have a dependency path leading TO this asset."""
        driver = get_driver()
        async with driver.session() as session:
            count = await session.execute_read(
                self._get_dependents_count_tx, asset_id
            )
        return count

    @staticmethod
    async def _get_dependents_count_tx(
        tx: AsyncManagedTransaction, asset_id: str
    ) -> int:
        query = """
        MATCH (dependent:Asset)-[*1..10]->(target:Asset {asset_id: $asset_id})
        WHERE dependent.asset_id <> $asset_id
        RETURN count(DISTINCT dependent) AS cnt
        """
        result = await tx.run(query, asset_id=asset_id)
        record = await result.single()
        return record["cnt"] if record else 0

    async def remove_asset(self, asset_id: str) -> None:
        """Remove an asset and all its relationships from the graph."""
        driver = get_driver()
        async with driver.session() as session:
            await session.execute_write(self._remove_asset_tx, asset_id)
        logger.info("graph.asset_removed", asset_id=asset_id)

    @staticmethod
    async def _remove_asset_tx(
        tx: AsyncManagedTransaction, asset_id: str
    ) -> None:
        query = """
        MATCH (n:Asset {asset_id: $asset_id})
        DETACH DELETE n
        """
        await tx.run(query, asset_id=asset_id)


# Singleton — import and use this instance throughout the backend
graph_service = GraphService()
