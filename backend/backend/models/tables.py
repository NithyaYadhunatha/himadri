"""
SQLAlchemy ORM models for HIMADRI.

Domain: Antarctic research station digital twin (Maitri + Bharati, PS 26060 /
ISRO-NCPOR). Tables: stations, zones, assets, readings, alert_rules, alerts,
commands, audit_events, scenarios, reports, inventory_items, convoys,
convoy_assignments, waste_records, risk_cells, advisories, maintenance_events,
plus the predictive-maintenance ML tables (unchanged shape, asset-scoped now).
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database.postgres import Base


def new_uuid() -> str:
    return str(uuid.uuid4())


_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(*parts: str) -> str:
    """station.category.name -> 'maitri-fuel-tank-07' style id fragment."""
    joined = "-".join(parts)
    return _SLUG_RE.sub("-", joined.lower()).strip("-")


# ─── Stations & spatial hierarchy ──────────────────────────────────────────


class Station(Base):
    __tablename__ = "stations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # 'maitri' | 'bharati'
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    elevation_m: Mapped[float | None] = mapped_column(Float)
    established: Mapped[Any | None] = mapped_column(Date)
    winter_capacity: Mapped[int | None] = mapped_column(Integer)
    summer_capacity: Mapped[int | None] = mapped_column(Integer)
    local_utc_offset_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=180)
    description: Mapped[str | None] = mapped_column(Text)
    # Reserved for the Unity WebGL 3D twin build — not consumed by this backend
    # today; the frontend renders a placeholder slot until that build lands.
    twin_model_ref: Mapped[str | None] = mapped_column(String(255))
    provenance: Mapped[str] = mapped_column(String(16), nullable=False, default="verified")

    zones: Mapped[list[Zone]] = relationship("Zone", back_populates="station", cascade="all, delete-orphan")
    assets: Mapped[list[Asset]] = relationship("Asset", back_populates="station", cascade="all, delete-orphan")


class Zone(Base):
    __tablename__ = "zones"

    id: Mapped[str] = mapped_column(String(160), primary_key=True)
    station_id: Mapped[str] = mapped_column(String(32), ForeignKey("stations.id", ondelete="CASCADE"), nullable=False)
    parent_id: Mapped[str | None] = mapped_column(String(160), ForeignKey("zones.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # floor | room | outdoor | module | route_point
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    floor: Mapped[int | None] = mapped_column(Integer)
    restricted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # FR-71
    # 2D floor-plan layout hint: {x, y, w, h} in plan units. The Unity/WebGL
    # 3D twin will consume its own model_ref-driven geometry separately.
    layout: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    provenance: Mapped[str] = mapped_column(String(16), nullable=False, default="verified")

    station: Mapped[Station] = relationship("Station", back_populates="zones")
    assets: Mapped[list[Asset]] = relationship("Asset", back_populates="zone")


# ─── Assets (was Node) ──────────────────────────────────────────────────────

ASSET_CATEGORIES = (
    "power", "heating", "water", "waste", "vehicle", "instrument",
    "storage", "medical", "comms", "structure",
)
PROVENANCE_VALUES = ("verified", "documentary", "unverified", "simulated")


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(160), primary_key=True)  # slug, also the QR payload (FR-95)
    station_id: Mapped[str] = mapped_column(String(32), ForeignKey("stations.id", ondelete="CASCADE"), nullable=False)
    zone_id: Mapped[str | None] = mapped_column(String(160), ForeignKey("zones.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # power | heating | water | waste | vehicle | instrument | storage | medical | comms | structure
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    subtype: Mapped[str | None] = mapped_column(String(64))  # generator | fuel_tank | freezer | pistenbully | ...
    manufacturer: Mapped[str | None] = mapped_column(String(255))
    spec: Mapped[dict[str, Any] | None] = mapped_column(JSONB)  # capacity, rating, model no, vehicle hours, etc.

    controllable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    life_safety: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # gates two-step approval
    responsible_user: Mapped[str | None] = mapped_column(String(255))

    # ok | degraded | fault | offline | maintenance | simulating
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="offline")
    health_score: Mapped[float] = mapped_column(Float, nullable=False, default=100.0)
    risk_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    primary_series: Mapped[str | None] = mapped_column(String(64))  # which reading key drives the dashboard tile
    primary_value: Mapped[float | None] = mapped_column(Float)
    primary_unit: Mapped[str | None] = mapped_column(String(32))

    api_key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    approved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)  # FR-101 pending-approval queue
    manifest: Mapped[dict[str, Any] | None] = mapped_column(JSONB)  # last self-describing device manifest (FR-100)

    provenance: Mapped[str] = mapped_column(String(16), nullable=False, default="simulated")

    registered_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    last_seen: Mapped[datetime | None] = mapped_column(nullable=True)

    station: Mapped[Station] = relationship("Station", back_populates="assets")
    zone: Mapped[Zone | None] = relationship("Zone", back_populates="assets")
    readings: Mapped[list[Reading]] = relationship("Reading", back_populates="asset", cascade="all, delete-orphan")
    alerts: Mapped[list[Alert]] = relationship("Alert", back_populates="asset", cascade="all, delete-orphan")
    reports: Mapped[list[Report]] = relationship("Report", back_populates="asset", cascade="all, delete-orphan")
    commands: Mapped[list[Command]] = relationship("Command", back_populates="asset", cascade="all, delete-orphan")
    maintenance_events: Mapped[list[MaintenanceEvent]] = relationship(
        "MaintenanceEvent", back_populates="asset", cascade="all, delete-orphan"
    )


# ─── Readings (was Metric) ──────────────────────────────────────────────────
# Antarctic telemetry is heterogeneous per asset category (litres, °C, kW, nT,
# m/s...) so — unlike the old fixed cpu/mem/disk columns — values live in a
# flexible {series_key: value} JSON document, with one denormalised
# primary_value/primary_unit pair for cheap "latest value" reads.


class Reading(Base):
    __tablename__ = "readings"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    asset_id: Mapped[str] = mapped_column(String(160), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)

    values: Mapped[dict[str, float | str]] = mapped_column(JSONB, nullable=False)  # {"level_l": 4200, "temp_c": -19.1}
    units: Mapped[dict[str, str] | None] = mapped_column(JSONB)  # {"level_l": "L", "temp_c": "degC"}

    # sensor | manual | simulated (FR-27)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="simulated")
    entered_by: Mapped[str | None] = mapped_column(String(255))  # set when source='manual'

    simulation_active: Mapped[bool] = mapped_column(Boolean, default=False)
    simulation_type: Mapped[str | None] = mapped_column(String(64))

    collected_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    asset: Mapped[Asset] = relationship("Asset", back_populates="readings")


# ─── Alert rules & alerts ───────────────────────────────────────────────────

ALERT_CATEGORIES = ("safety", "power", "environment", "logistics", "science", "security")
ALERT_SEVERITIES = ("info", "warning", "critical", "emergency")


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id: Mapped[str] = mapped_column(String(160), primary_key=True)
    station_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("stations.id", ondelete="CASCADE"))
    asset_id: Mapped[str | None] = mapped_column(String(160), ForeignKey("assets.id", ondelete="CASCADE"))
    series_key: Mapped[str | None] = mapped_column(String(64))
    # above | below | out_of_band | rate_of_change | stale | anomaly
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    params: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    category: Mapped[str] = mapped_column(String(16), nullable=False)
    escalate_after_seconds: Mapped[int | None] = mapped_column(Integer)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    auto_generated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # from a device manifest


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    rule_id: Mapped[str | None] = mapped_column(String(160), ForeignKey("alert_rules.id", ondelete="SET NULL"))
    station_id: Mapped[str] = mapped_column(String(32), nullable=False)
    asset_id: Mapped[str] = mapped_column(String(160), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    series_key: Mapped[str | None] = mapped_column(String(64))

    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    category: Mapped[str] = mapped_column(String(16), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    value: Mapped[float | None] = mapped_column(Float)

    first_seen: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    last_seen: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    occurrences: Mapped[int] = mapped_column(Integer, nullable=False, default=1)  # FR-61 dedup counter

    # open | acked | resolved | suppressed
    state: Mapped[str] = mapped_column(String(16), nullable=False, default="open")
    acked_by: Mapped[str | None] = mapped_column(String(255))
    acked_at: Mapped[datetime | None] = mapped_column(nullable=True)
    ack_note: Mapped[str | None] = mapped_column(Text)
    escalated_at: Mapped[datetime | None] = mapped_column(nullable=True)

    asset: Mapped[Asset] = relationship("Asset", back_populates="alerts")

    __table_args__ = (
        UniqueConstraint("rule_id", "asset_id", "series_key", "state", name="uq_alert_open_natural_key"),
    )


# ─── Notification recipients (email alerting config) ───────────────────────
# Plain operational config, NOT a user/account concept — see
# context/BACKLOG.md's "Boundary reminder": this backend must never learn
# about users/roles/departments. A recipient here is just an email address to
# notify on escalation, optionally scoped to one station — structurally
# closer to AlertRule (station_id nullable = unrestricted) than to a User.
# The Clerk+MongoDB user/role layer lives entirely in the frontend repo.


class NotificationRecipient(Base):
    __tablename__ = "notification_recipients"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str | None] = mapped_column(String(255))
    # null = notified for every station's escalated alerts (fleet-wide)
    station_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("stations.id", ondelete="CASCADE"))
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)


class NotificationLog(Base):
    """One row per email the alerting system tried to send (or would have sent
    in dry-run mode when RESEND_API_KEY is unset). Powers the admin
    Notifications page's delivery log; purely an audit/visibility aid, never
    read by the alert engine itself."""

    __tablename__ = "notification_log"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    alert_id: Mapped[str | None] = mapped_column(String(64))
    station_id: Mapped[str | None] = mapped_column(String(32))
    recipient_email: Mapped[str] = mapped_column(String(255), nullable=False)
    severity: Mapped[str | None] = mapped_column(String(16))
    subject: Mapped[str] = mapped_column(String(300), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="escalation")  # escalation | test
    status: Mapped[str] = mapped_column(String(16), nullable=False)  # sent | dry_run | failed
    error: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)


# ─── Commands (two-phase actuation, FR-9…14) ────────────────────────────────


class Command(Base):
    __tablename__ = "commands"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    station_id: Mapped[str] = mapped_column(String(32), nullable=False)
    asset_id: Mapped[str] = mapped_column(String(160), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    action: Mapped[str] = mapped_column(String(32), nullable=False)  # setpoint | start | stop | mode
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)

    issued_by: Mapped[str] = mapped_column(String(255), nullable=False)
    issued_role: Mapped[str] = mapped_column(String(64), nullable=False)
    issued_from: Mapped[str] = mapped_column(String(16), nullable=False)  # 'station' | 'hq'

    requires_second_approval: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    approved_by: Mapped[str | None] = mapped_column(String(255))
    approved_at: Mapped[datetime | None] = mapped_column(nullable=True)

    # queued | sent | acked | applied | failed | expired
    state: Mapped[str] = mapped_column(String(16), nullable=False, default="queued")
    expires_at: Mapped[datetime] = mapped_column(nullable=False)
    acked_at: Mapped[datetime | None] = mapped_column(nullable=True)
    applied_at: Mapped[datetime | None] = mapped_column(nullable=True)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    asset: Mapped[Asset] = relationship("Asset", back_populates="commands")


# ─── Audit (hash-chained, NFR-14) ───────────────────────────────────────────


class AuditEvent(Base):
    __tablename__ = "audit_events"

    seq: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    user_id: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[str | None] = mapped_column(String(64))
    station_id: Mapped[str | None] = mapped_column(String(32))
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    resource: Mapped[str | None] = mapped_column(String(255))
    detail: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    prev_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    hash: Mapped[str] = mapped_column(String(64), nullable=False)


class SyncItem(Base):
    __tablename__ = "sync_items"

    node_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    seq: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    table_name: Mapped[str] = mapped_column(String(64), nullable=False)
    row_id: Mapped[str] = mapped_column(String(255), nullable=False)
    op: Mapped[str] = mapped_column(String(16), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    priority: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    sent_at: Mapped[datetime | None] = mapped_column(nullable=True)
    acked_at: Mapped[datetime | None] = mapped_column(nullable=True)


class SyncControl(Base):
    __tablename__ = "sync_controls"

    node_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    paused: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_sync: Mapped[datetime | None] = mapped_column(nullable=True)


# ─── Reports ─────────────────────────────────────────────────────────────────


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    # health | risk | environmental | daily_brief
    report_type: Mapped[str] = mapped_column(String(32), nullable=False)
    station_id: Mapped[str | None] = mapped_column(String(32))
    asset_id: Mapped[str | None] = mapped_column(String(160), ForeignKey("assets.id", ondelete="SET NULL"))

    title: Mapped[str] = mapped_column(String(512), nullable=False)
    content_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    text_summary: Mapped[str | None] = mapped_column(Text)

    range_from: Mapped[datetime | None] = mapped_column(nullable=True)
    range_to: Mapped[datetime | None] = mapped_column(nullable=True)
    generated_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    asset: Mapped[Asset | None] = relationship("Asset", back_populates="reports")


# ─── Scenarios / what-if (was Simulation, FR-82…88) ─────────────────────────

SCENARIO_PRESETS = (
    "resupply_fails", "generator_fails_winter", "medical_evacuation",
    "convoy_stranded", "extended_storm",
)


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    station_id: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    preset: Mapped[str | None] = mapped_column(String(64))  # one of SCENARIO_PRESETS, or null = custom
    horizon_days: Mapped[int] = mapped_column(Integer, nullable=False, default=90)

    # headcount, generator_availability, convoy_schedule, weather_severity,
    # fuel_delivery, failure_events
    inputs: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    # running | completed | failed
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="running")
    outputs: Mapped[dict[str, Any] | None] = mapped_column(JSONB)  # endurance/carbon/timeline breakdown
    fuel_endurance_days: Mapped[float | None] = mapped_column(Float)
    food_endurance_days: Mapped[float | None] = mapped_column(Float)
    survivability_verdict: Mapped[str | None] = mapped_column(String(32))  # survives | fails
    first_failure_at_day: Mapped[int | None] = mapped_column(Integer)
    first_failure_cause: Mapped[str | None] = mapped_column(String(255))
    cost_inr: Mapped[float | None] = mapped_column(Float)
    carbon_kg_co2e: Mapped[float | None] = mapped_column(Float)

    created_by: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)


# ─── Logistics: inventory, convoys, waste ───────────────────────────────────


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id: Mapped[str] = mapped_column(String(160), primary_key=True)
    station_id: Mapped[str] = mapped_column(String(32), nullable=False)
    zone_id: Mapped[str | None] = mapped_column(String(160), ForeignKey("zones.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # fuel | food | spare | waste
    subtype: Mapped[str | None] = mapped_column(String(32))  # atf | petrol | lubricant | dry | frozen | hydraulic...
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(16), nullable=False)
    capacity: Mapped[float | None] = mapped_column(Float)
    # routine | emergency_cache | safety_buffer (FR-29)
    reserve_class: Mapped[str] = mapped_column(String(32), nullable=False, default="routine")
    expiry: Mapped[Any | None] = mapped_column(Date)
    last_checked: Mapped[datetime | None] = mapped_column(nullable=True)
    checked_by: Mapped[str | None] = mapped_column(String(255))
    provenance: Mapped[str] = mapped_column(String(16), nullable=False, default="simulated")


class Convoy(Base):
    __tablename__ = "convoys"

    id: Mapped[str] = mapped_column(String(160), primary_key=True)
    station_id: Mapped[str] = mapped_column(String(32), nullable=False)
    season: Mapped[str | None] = mapped_column(String(32))
    planned_start: Mapped[datetime | None] = mapped_column(nullable=True)
    route_ref: Mapped[str | None] = mapped_column(String(255))
    distance_km: Mapped[float | None] = mapped_column(Float)
    state: Mapped[str] = mapped_column(String(16), nullable=False, default="planned")  # planned|underway|returned|aborted
    medical_officer: Mapped[str | None] = mapped_column(String(255))  # NOT NULL enforced at service layer, FR-35
    eta: Mapped[datetime | None] = mapped_column(nullable=True)
    fuel_used_l: Mapped[float | None] = mapped_column(Float)
    fuel_planned_l: Mapped[float | None] = mapped_column(Float)

    assignments: Mapped[list[ConvoyAssignment]] = relationship(
        "ConvoyAssignment", back_populates="convoy", cascade="all, delete-orphan"
    )


class ConvoyAssignment(Base):
    __tablename__ = "convoy_assignments"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    convoy_id: Mapped[str] = mapped_column(String(160), ForeignKey("convoys.id", ondelete="CASCADE"), nullable=False)
    member_name: Mapped[str] = mapped_column(String(255), nullable=False)
    vehicle_asset_id: Mapped[str | None] = mapped_column(String(160), ForeignKey("assets.id", ondelete="SET NULL"))
    equipment_charge: Mapped[str | None] = mapped_column(String(255))

    convoy: Mapped[Convoy] = relationship("Convoy", back_populates="assignments")


class WasteRecord(Base):
    __tablename__ = "waste_records"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    station_id: Mapped[str] = mapped_column(String(32), nullable=False)
    stream: Mapped[str] = mapped_column(String(16), nullable=False)  # paper|plastic|metal|glass|food|hazardous
    mass_kg: Mapped[float | None] = mapped_column(Float)
    volume_l: Mapped[float | None] = mapped_column(Float)
    container_id: Mapped[str | None] = mapped_column(String(160))
    processed_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    disposition: Mapped[str] = mapped_column(String(16), nullable=False)  # stored|compacted|backloaded
    recorded_by: Mapped[str | None] = mapped_column(String(255))


# ─── Predictive / risk / advisories ─────────────────────────────────────────


class RiskCell(Base):
    __tablename__ = "risk_cells"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    station_id: Mapped[str] = mapped_column(String(32), nullable=False)
    zone_id: Mapped[str | None] = mapped_column(String(160))
    subsystem: Mapped[str] = mapped_column(String(64), nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    factors: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)  # [{name,score,weight,evidence}]
    computed_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)


class Advisory(Base):
    __tablename__ = "advisories"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    station_id: Mapped[str] = mapped_column(String(32), nullable=False)
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    saving_litres: Mapped[float | None] = mapped_column(Float)
    saving_kwh: Mapped[float | None] = mapped_column(Float)
    saving_kgco2e: Mapped[float | None] = mapped_column(Float)
    saving_inr: Mapped[float | None] = mapped_column(Float)
    proposed_command: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    state: Mapped[str] = mapped_column(String(16), nullable=False, default="proposed")  # proposed|accepted|rejected
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    decided_by: Mapped[str | None] = mapped_column(String(255))
    decided_at: Mapped[datetime | None] = mapped_column(nullable=True)


class MaintenanceEvent(Base):
    __tablename__ = "maintenance_events"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    asset_id: Mapped[str] = mapped_column(String(160), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(16), nullable=False)  # maintenance | fault
    description: Mapped[str] = mapped_column(Text, nullable=False)
    fault_code: Mapped[str | None] = mapped_column(String(64))
    logged_by: Mapped[str | None] = mapped_column(String(255))
    logged_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    asset: Mapped[Asset] = relationship("Asset", back_populates="maintenance_events")


# ─── Predictive Maintenance ML Tables (asset-scoped, shape unchanged) ───────


class MLModelVersion(Base):
    __tablename__ = "ml_model_versions"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    version: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    trained_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    data_start: Mapped[datetime | None] = mapped_column(nullable=True)
    data_end: Mapped[datetime | None] = mapped_column(nullable=True)
    metrics_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="candidate")
    artifact_path: Mapped[str | None] = mapped_column(String(512), nullable=True)

    predictions: Mapped[list[MLPrediction]] = relationship(
        "MLPrediction", back_populates="model_version", cascade="all, delete-orphan"
    )


class MLPrediction(Base):
    __tablename__ = "ml_predictions"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    asset_id: Mapped[str] = mapped_column(
        String(160), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False
    )
    model_version_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("ml_model_versions.id", ondelete="CASCADE"), nullable=False
    )
    predicted_failure_prob: Mapped[float] = mapped_column(Float, nullable=False)
    predicted_runtime_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    risk_level: Mapped[str] = mapped_column(String(16), nullable=False)  # LOW|MEDIUM|HIGH|CRITICAL
    primary_risk_factors: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    prediction_timestamp: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    model_version: Mapped[MLModelVersion] = relationship("MLModelVersion", back_populates="predictions")
    outcomes: Mapped[list[MLPredictionOutcome]] = relationship(
        "MLPredictionOutcome", back_populates="prediction", cascade="all, delete-orphan"
    )


class MLPredictionOutcome(Base):
    __tablename__ = "ml_prediction_outcomes"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    prediction_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("ml_predictions.id", ondelete="CASCADE"), nullable=False
    )
    actual_failure_time: Mapped[datetime | None] = mapped_column(nullable=True)
    actual_downtime_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)
    # CORRECT | EARLY | LATE | FALSE_POSITIVE | FALSE_NEGATIVE | NO_FAILURE
    outcome: Mapped[str] = mapped_column(String(32), nullable=False)
    evaluated_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    prediction: Mapped[MLPrediction] = relationship("MLPrediction", back_populates="outcomes")
