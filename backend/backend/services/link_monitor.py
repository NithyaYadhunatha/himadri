"""
Link monitor — keeps ``settings.LINK_STATE`` honest.

The sync router, the ``X-Link-State`` response header and the UI's uplink
banner all read ``settings.LINK_STATE``. Until now that was a static string, so
the station could never *notice* that the satellite link had dropped. This
background task probes the HQ receiver and updates it:

  standalone  no HQ_SYNC_URL configured — a self-contained node
  up          HQ answered 200 quickly
  degraded    HQ answered, but slowly (or with a 5xx)
  down        HQ unreachable / timed out

It never raises and never blocks request handling.
"""

from __future__ import annotations

import asyncio
import time

import httpx
import structlog

from backend.config import settings

logger = structlog.get_logger(__name__)

PROBE_TIMEOUT_SECONDS = 4.0
SLOW_THRESHOLD_SECONDS = 1.5


async def probe_once() -> str:
    """Return the link state implied by a single probe of the HQ receiver."""
    if not settings.HQ_SYNC_URL:
        return "standalone"
    url = f"{settings.HQ_SYNC_URL.rstrip('/')}/health"
    started = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=PROBE_TIMEOUT_SECONDS) as client:
            response = await client.get(url)
    except (httpx.HTTPError, OSError):
        return "down"
    elapsed = time.monotonic() - started
    if response.status_code >= 500:
        return "degraded"
    if response.status_code != 200:
        return "down"
    return "up" if elapsed <= SLOW_THRESHOLD_SECONDS else "degraded"


async def run_forever() -> None:
    logger.info("link_monitor.started", hq=bool(settings.HQ_SYNC_URL), interval=settings.LINK_CHECK_SECONDS)
    while True:
        try:
            state = await probe_once()
            if state != settings.LINK_STATE:
                logger.info("link_monitor.state_changed", previous=settings.LINK_STATE, current=state)
                settings.LINK_STATE = state
        except Exception as exc:  # noqa: BLE001 — a monitor must never die
            logger.error("link_monitor.error", error=str(exc))
        await asyncio.sleep(settings.LINK_CHECK_SECONDS)
