"""
init_graph.py — Seed Neo4j with the same minimal starter assets init_db.py
creates, plus a couple of illustrative dependency relationships. Run AFTER
init_db.py and AFTER Neo4j is healthy.

Usage:
    python scripts/init_graph.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

# pyrefly: ignore [missing-import]
import structlog

from backend.database.neo4j_client import graph_service, get_driver, close_driver

logger = structlog.get_logger(__name__)

# These ids must match scripts/init_db.py's ASSETS
ASSETS = [
    {"asset_id": "maitri-power-generator-01", "name": "Generator 1", "category": "power",
     "station_id": "maitri", "status": "offline", "health_score": 100.0},
    {"asset_id": "maitri-storage-freezer-01", "name": "Deep Freezer 1", "category": "storage",
     "station_id": "maitri", "status": "offline", "health_score": 100.0},
    {"asset_id": "maitri-instrument-aws-01", "name": "Automatic Weather Station", "category": "instrument",
     "station_id": "maitri", "status": "offline", "health_score": 100.0},
    {"asset_id": "bharati-power-chp-01", "name": "CHP Unit 1", "category": "power",
     "station_id": "bharati", "status": "offline", "health_score": 100.0},
    {"asset_id": "bharati-storage-freezer-01", "name": "Interspace Freezer", "category": "storage",
     "station_id": "bharati", "status": "offline", "health_score": 100.0},
    {"asset_id": "bharati-instrument-aws-01", "name": "Automatic Weather Station", "category": "instrument",
     "station_id": "bharati", "status": "offline", "health_score": 100.0},
]

# Directed relationships: (from, to, type) — a freezer DEPENDS_ON station power.
RELATIONSHIPS = [
    ("maitri-storage-freezer-01", "maitri-power-generator-01", "DEPENDS_ON"),
    ("bharati-storage-freezer-01", "bharati-power-chp-01", "DEPENDS_ON"),
]


async def main() -> None:
    logger.info("init_graph.starting")

    # Verify connectivity
    driver = get_driver()
    await driver.verify_connectivity()
    logger.info("init_graph.neo4j_connected")

    # Create asset nodes
    for asset in ASSETS:
        await graph_service.register_asset(
            asset_id=asset["asset_id"],
            name=asset["name"],
            category=asset["category"],
            station_id=asset["station_id"],
            status=asset["status"],
            health_score=asset["health_score"],
        )
        print(f"   Graph asset: {asset['name']} ({asset['category']}, {asset['station_id']})")

    # Create relationships
    for from_id, to_id, rel_type in RELATIONSHIPS:
        await graph_service.add_relationship(from_id, to_id, rel_type)
        print(f"   Relationship: {from_id} -{rel_type}-> {to_id}")

    await close_driver()

    print("\nNeo4j graph initialized successfully!")
    print(f"   Assets: {len(ASSETS)} (3 per station, maitri + bharati)")
    print(f"   Relationships: {len(RELATIONSHIPS)}")
    print("   View graph: http://localhost:7474")
    print("   Cypher: MATCH (n)-[r]->(m) RETURN n,r,m")


if __name__ == "__main__":
    asyncio.run(main())
