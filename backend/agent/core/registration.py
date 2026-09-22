"""
Authentication — the agent never registers assets itself (that's admin-only,
done from the HIMADRI frontend's "Connect New Device" action, POST
/agent/register — see backend/routers/agents.py, Bearer-protected). This
module only ever *authenticates* an existing asset_id + api_key pair against
GET /agent/whoami and persists it locally for next launch.
"""

from __future__ import annotations

import time
from typing import Any

import httpx
import structlog
import yaml

from . import device_store

logger = structlog.get_logger(__name__)


class RegistrationError(Exception):
    pass


def _load_config(config_path: str = "config/device.yaml") -> dict[str, Any]:
    try:
        with open(config_path, "r") as f:
            return yaml.safe_load(f) or {}
    except FileNotFoundError:
        logger.warning("registration.config_not_found", path=config_path)
        return {}


def load_defaults(config_path: str = "config/device.yaml") -> dict[str, Any]:
    """Defaults used to pre-fill the setup dialog — read from device.yaml."""
    config = _load_config(config_path)
    return {
        "backend_url": config.get("backend_url", "http://localhost:8000"),
        "interval": int(config.get("report_interval_seconds", 10)),
    }


def authenticate(
    asset_id: str,
    api_key: str,
    backend_url: str,
    config_path: str = "config/device.yaml",
    max_retries: int = 10,
) -> dict[str, Any]:
    """
    Verify asset_id + api_key against the backend and fetch this asset's
    identity via GET /agent/whoami (backend/schemas/schemas.py's
    WhoAmIResponse: asset_id, asset_name, category, subtype, station_id).

    Returns: { asset_id, api_key, asset_name, category, subtype, station_id,
    backend_url, interval }.
    Raises RegistrationError if the credentials are invalid or the backend
    is unreachable after retrying.
    """
    interval = load_defaults(config_path)["interval"]

    for attempt in range(1, max_retries + 1):
        try:
            logger.info("authenticate.attempt", attempt=attempt, backend_url=backend_url)
            with httpx.Client(timeout=10.0) as client:
                response = client.get(
                    f"{backend_url}/agent/whoami",
                    headers={"X-API-Key": api_key},
                )
                if response.status_code == 401:
                    raise RegistrationError(
                        "Invalid Asset ID / API Key — check they were copied correctly "
                        "from the HIMADRI dashboard's Connect New Device screen."
                    )
                response.raise_for_status()
                data = response.json()

            if data["asset_id"] != asset_id:
                raise RegistrationError(
                    "This API Key belongs to a different Asset ID than the one entered."
                )

            result = {
                "asset_id": data["asset_id"],
                "api_key": api_key,
                "asset_name": data["asset_name"],
                "category": data["category"],
                "subtype": data.get("subtype"),
                "station_id": data["station_id"],
                "backend_url": backend_url,
                "interval": interval,
            }
            device_store.save_entry(
                asset_id=result["asset_id"],
                api_key=result["api_key"],
                asset_name=result["asset_name"],
                category=result["category"],
                subtype=result["subtype"],
                station_id=result["station_id"],
                backend_url=result["backend_url"],
            )
            logger.info("authenticate.success", asset_id=result["asset_id"], asset_name=result["asset_name"])
            return result

        except (httpx.ConnectError, httpx.TimeoutException) as e:
            backoff = min(2 ** attempt, 30)
            logger.warning(
                "authenticate.retry",
                attempt=attempt,
                max_retries=max_retries,
                error=str(e),
                backoff_seconds=backoff,
            )
            if attempt < max_retries:
                time.sleep(backoff)
            else:
                raise RegistrationError(
                    f"Could not reach backend at {backend_url} after {max_retries} attempts"
                ) from e
        except httpx.HTTPStatusError as e:
            raise RegistrationError(
                f"Backend rejected the request: {e.response.status_code} {e.response.text}"
            ) from e

    raise RegistrationError("Authentication failed — unknown error")
