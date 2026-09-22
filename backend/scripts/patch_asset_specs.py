import asyncio
import sys
from pathlib import Path
import random

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.database.postgres import get_session_factory
from backend.models.tables import Asset
# pyrefly: ignore [missing-import]
from sqlalchemy import select

async def main():
    factory = get_session_factory()
    async with factory() as db:
        result = await db.execute(select(Asset))
        assets = result.scalars().all()
        
        for asset in assets:
            # We must assign a new dict so SQLAlchemy knows it changed
            new_spec = dict(asset.spec) if asset.spec else {}
            
            new_spec["uptime"] = random.randint(1000, 100000) * 3600
            new_spec["version"] = f"v{random.randint(1, 5)}.{random.randint(0, 9)}"
            new_spec["ip_address"] = f"192.168.1.{random.randint(10, 250)}"
            new_spec["tags"] = ["verified", "critical"] if asset.life_safety else ["standard"]
            
            asset.spec = new_spec
            
        await db.commit()
        print(f"Patched {len(assets)} assets with mock spec data.")

if __name__ == "__main__":
    asyncio.run(main())
