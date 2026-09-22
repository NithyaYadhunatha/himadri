"""
sync_neo4j.py — Sync all assets from Postgres into Neo4j.
Run this script to populate Neo4j with the test data from Postgres.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

# pyrefly: ignore [missing-import]
from sqlalchemy import select

from backend.database.postgres import get_session_factory
from backend.database.neo4j_client import graph_service, get_driver, close_driver
from backend.models.tables import Asset

async def main():
    print("Connecting to Neo4j...")
    driver = get_driver()
    await driver.verify_connectivity()
    
    print("Connecting to Postgres...")
    factory = get_session_factory()
    
    async with factory() as db:
        print("Fetching assets from Postgres...")
        result = await db.execute(select(Asset))
        assets = list(result.scalars().all())
    
    print(f"Found {len(assets)} assets. Syncing to Neo4j...")
    
    count = 0
    for asset in assets:
        await graph_service.register_asset(
            asset_id=asset.id,
            name=asset.name,
            category=asset.category,
            station_id=asset.station_id,
            status=asset.status,
            health_score=asset.health_score,
            zone_id=asset.zone_id,
        )
        count += 1
    
    await close_driver()
    print(f"Successfully synced {count} assets to Neo4j.")

if __name__ == "__main__":
    asyncio.run(main())
