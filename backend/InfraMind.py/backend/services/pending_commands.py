"""
In-memory, single-process pending-command queue bridging an admin/dashboard
action (e.g. "clear this injected fault") to the next heartbeat a specific
device agent sends. There is no push channel to the agent (the heartbeat
contract is the only round trip it ever makes), so this is relayed by being
attached to that asset's next HeartbeatResponse and consumed exactly once.

This is separate from the formal Command two-phase state machine
(services/command_engine.py) — that one is for real actuation (setpoint/
start/stop with audit + life-safety approval); this one is only for
demo/simulator control ("stop the fault you're injecting"), which carries no
safety weight and needs no approval.

Deliberately not persisted to Postgres/Redis — a transient control signal,
not data that needs to survive a backend restart. Not safe across multiple
worker processes (a plain in-process set), same single-process assumption
backend/websocket/manager.py's connection pool already makes.
"""

_pending_stop_simulation: set[str] = set()


def queue_stop_simulation(asset_id: str) -> None:
    """Mark that this asset's device agent should stop its current injected
    fault on its next heartbeat."""
    _pending_stop_simulation.add(asset_id)


def consume_stop_simulation(asset_id: str) -> bool:
    """Check and clear a pending stop-simulation command for this asset.
    Returns True exactly once per queue_stop_simulation() call."""
    if asset_id in _pending_stop_simulation:
        _pending_stop_simulation.discard(asset_id)
        return True
    return False
