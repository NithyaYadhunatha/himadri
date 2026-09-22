"""
Heartbeat — periodic POST to /agent/heartbeat with synthetic Antarctic
asset telemetry, matching backend/schemas/schemas.py's HeartbeatRequest
({asset_id, timestamp, reading: {values, units}, status, simulation_active,
simulation_type}) and HeartbeatResponse ({received, alerts, stop_simulation,
pending_command: {command_id, action, payload} | null}).

Runs on a background thread so it doesn't block the PySide6 GUI.
"""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any, Callable

import httpx
import structlog

from . import collector, simulator

logger = structlog.get_logger(__name__)


class HeartbeatThread(threading.Thread):
    """
    Background thread that generates this asset's synthetic reading and
    POSTs heartbeats to the backend at a configurable interval. Uses a stop
    event for clean shutdown.
    """

    def __init__(
        self,
        asset_id: str,
        api_key: str,
        backend_url: str,
        category: str,
        subtype: str | None = None,
        spec: dict[str, Any] | None = None,
        interval: int = 10,
        on_reading: Callable[[dict[str, Any]], None] | None = None,
        on_alerts: Callable[[list], None] | None = None,
    ) -> None:
        super().__init__(name="HeartbeatThread", daemon=True)
        self.asset_id = asset_id
        self.api_key = api_key
        self.backend_url = backend_url
        self.interval = interval
        self._spec = spec or {}
        # Called once per cycle with the reported values + a "connection_state"
        # field (connected | unreachable | timeout | http_<code>)
        self.on_reading = on_reading
        self.on_alerts = on_alerts  # Called when the backend returns open alerts

        self._stop_event = threading.Event()
        self._last_snapshot: dict[str, Any] = {}

        collector.identify(category, subtype, self._spec)

    def set_role(self, category: str, subtype: str | None = None) -> None:
        """Demo-only: repoint the LOCAL synthetic collector at a different
        asset category/subtype so one laptop can pretend to be any HIMADRI
        instrument type for the demo. Unlike the old InfraMind agent's
        node_type field, HeartbeatRequest carries no category — an asset's
        category/subtype is fixed at registration time by
        backend/routers/agents.py's POST /agent/register — so this can
        never change what the backend thinks this asset_id is. It only
        changes which synthetic values THIS process generates locally."""
        collector.identify(category, subtype, self._spec)

    def get_last_snapshot(self) -> dict[str, Any]:
        """Thread-safe-enough read of the last reported reading."""
        return dict(self._last_snapshot)

    def stop(self) -> None:
        """Signal the thread to stop after the current heartbeat cycle."""
        self._stop_event.set()

    def run(self) -> None:
        logger.info("heartbeat.thread_started", interval=self.interval)
        client = httpx.Client(timeout=5.0)

        try:
            while not self._stop_event.wait(timeout=self.interval):
                self._send_heartbeat(client)
        finally:
            client.close()
            logger.info("heartbeat.thread_stopped")

    def _emit(self, display: dict[str, Any]) -> None:
        """Store the latest snapshot and notify the GUI."""
        self._last_snapshot = display
        if self.on_reading:
            self.on_reading(display)

    def _send_heartbeat(self, client: httpx.Client) -> None:
        # ── Generate this tick's synthetic reading ────────────────────────────
        snapshot = collector.collect(self.interval)
        real_values = dict(snapshot.values)

        # ── Apply any active fault-injection override ─────────────────────────
        active, sim_type, _overrides = simulator.simulation_state.get_overrides()
        reported_values = simulator.apply_simulation(real_values)

        payload = {
            "asset_id": self.asset_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "reading": {"values": reported_values, "units": snapshot.units},
            "status": "fault" if active else "ok",
            "simulation_active": active,
            "simulation_type": sim_type,
        }

        display = dict(reported_values)
        display["units"] = snapshot.units
        display["simulation_active"] = active
        display["simulation_type"] = sim_type

        # ── POST to backend ───────────────────────────────────────────────────
        try:
            response = client.post(
                f"{self.backend_url}/agent/heartbeat",
                json=payload,
                headers={"X-API-Key": self.api_key},
            )
            response.raise_for_status()
            data = response.json()

            # Remote "stop the fault you're injecting" relayed via this
            # heartbeat's response (backend/services/pending_commands.py) —
            # stopping here updates the shared simulation_state immediately;
            # this cycle's `display` was already built from the pre-stop
            # override above, so the GUI and backend both see the fault as
            # stopped starting next cycle, not retroactively on this one.
            if data.get("stop_simulation"):
                simulator.simulation_state.stop()
                logger.info("heartbeat.remote_stop_simulation", asset_id=self.asset_id)

            # Real actuation round trip (backend/services/command_engine.py):
            # deliver + apply a queued Command, then ack via
            # POST /agent/command-result (backend/routers/agents.py).
            pending_command = data.get("pending_command")
            if pending_command:
                self._handle_pending_command(client, pending_command)

            active_alerts = data.get("alerts", [])
            display["connection_state"] = "connected"
            self._emit(display)
            if active_alerts and self.on_alerts:
                self.on_alerts(active_alerts)

            logger.debug(
                "heartbeat.sent",
                asset_id=self.asset_id,
                simulation=sim_type,
                alerts=len(active_alerts),
            )

        except httpx.ConnectError:
            logger.warning("heartbeat.backend_unreachable", url=self.backend_url)
            display["connection_state"] = "unreachable"
            self._emit(display)
        except httpx.TimeoutException:
            logger.warning("heartbeat.timeout")
            display["connection_state"] = "timeout"
            self._emit(display)
        except httpx.HTTPStatusError as e:
            logger.error("heartbeat.http_error", status=e.response.status_code)
            display["connection_state"] = f"http_{e.response.status_code}"
            self._emit(display)

    def _handle_pending_command(self, client: httpx.Client, pending_command: dict[str, Any]) -> None:
        """Apply a delivered Command to local synthetic state (see
        collector.apply_command — start/stop/setpoint/mode) and ack/apply it
        via POST /agent/command-result (CommandResultRequest: {command_id,
        success, result})."""
        command_id = pending_command.get("command_id")
        action = pending_command.get("action", "")
        command_payload = pending_command.get("payload") or {}

        try:
            result = collector.apply_command(action, command_payload)
            success = bool(result.get("applied", False))
        except Exception as e:  # never let a bad command payload kill the heartbeat thread
            logger.error("heartbeat.command_apply_failed", command_id=command_id, error=str(e))
            result = {"applied": False, "error": str(e)}
            success = False

        try:
            client.post(
                f"{self.backend_url}/agent/command-result",
                json={"command_id": command_id, "success": success, "result": result},
                headers={"X-API-Key": self.api_key},
            ).raise_for_status()
            logger.info("heartbeat.command_result_sent", command_id=command_id, success=success)
        except httpx.HTTPError as e:
            logger.warning("heartbeat.command_result_failed", command_id=command_id, error=str(e))
