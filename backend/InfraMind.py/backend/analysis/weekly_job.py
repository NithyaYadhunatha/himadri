"""
weekly_job.py — Standalone script to trigger model training.
Run: PYTHONPATH=. python3 backend/analysis/weekly_job.py
"""
import asyncio
import sys
# pyrefly: ignore [missing-import]
import structlog

from backend.analysis.train import run_training

logger = structlog.get_logger(__name__)


async def main() -> None:
    logger.info("weekly_job.starting")
    result = await run_training()
    logger.info("weekly_job.finished", result=result)
    if result.get("status") != "SUCCESS":
        sys.exit(1)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
