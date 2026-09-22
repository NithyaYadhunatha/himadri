"""
Device Store — persists known asset identities (asset_id + api_key) on this
machine so the agent can reopen as the *same* dashboard asset instead of
needing the Asset ID + API Key pasted in on every launch.

Storage: agent/config/devices_cache.json — a flat list of previously
connected assets, newest-used first. Never synced to the backend; purely
local memory for the setup dialog's "existing asset" picker.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

_CACHE_PATH = Path(__file__).resolve().parent.parent / "config" / "devices_cache.json"


def _load_raw() -> list[dict[str, Any]]:
    if not _CACHE_PATH.exists():
        return []
    try:
        with open(_CACHE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def _save_raw(entries: list[dict[str, Any]]) -> None:
    _CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(entries, f, indent=2)


def list_entries() -> list[dict[str, Any]]:
    """Return cached assets, most recently used first."""
    entries = _load_raw()
    entries.sort(key=lambda e: e.get("last_used", 0), reverse=True)
    return entries


def get_entry(asset_id: str) -> dict[str, Any] | None:
    for entry in _load_raw():
        if entry.get("asset_id") == asset_id:
            return entry
    return None


def save_entry(
    asset_id: str,
    api_key: str,
    asset_name: str,
    category: str,
    subtype: str | None,
    station_id: str,
    backend_url: str,
) -> None:
    """Insert or update a cached asset identity and bump its last-used time."""
    entries = _load_raw()
    entries = [e for e in entries if e.get("asset_id") != asset_id]
    entries.append(
        {
            "asset_id": asset_id,
            "api_key": api_key,
            "asset_name": asset_name,
            "category": category,
            "subtype": subtype,
            "station_id": station_id,
            "backend_url": backend_url,
            "last_used": time.time(),
        }
    )
    _save_raw(entries)


def remove_entry(asset_id: str) -> None:
    entries = [e for e in _load_raw() if e.get("asset_id") != asset_id]
    _save_raw(entries)
