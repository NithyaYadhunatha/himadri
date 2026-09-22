"""
Pydantic v2 schemas for all HIMADRI API request/response types.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

# pyrefly: ignore [missing-import]
from pydantic import BaseModel, Field

# ─── Device registration / auth ─────────────────────────────────────────────


class RegisterRequest(BaseModel):
    asset_name: str = Field(..., max_length=255)
    station_id: str = Field(..., max_length=32)
    category: str = Field(..., max_length=32)
    subtype: str | None = None
    zone_id: str | None = None
    manufacturer: str | None = None
    spec: dict[str, Any] | None = None
    controllable: bool = False
    life_safety: bool = False


class RegisterResponse(BaseModel):
    asset_id: str
    api_key: str
    message: str


class WhoAmIResponse(BaseModel):
    """Returned to a device authenticating with asset_id + api_key only —
    lets it display its own identity without ever registering itself."""

    asset_id: str
    asset_name: str
    category: str
    subtype: str | None = None
    station_id: str


class AssetCredentials(BaseModel):
    """Re-fetchable asset identity — lets an admin view a device's api_key
    again after the initial registration response."""

    asset_id: str
    api_key: str
    asset_name: str


class StopSimulationResponse(BaseModel):
    asset_id: str
    queued: bool


class AddEdgeRequest(BaseModel):
    target_id: str = Field(..., min_length=1, max_length=255)
    rel_type: str = Field(..., min_length=1, max_length=64)


class AddEdgeResponse(BaseModel):
    source_id: str
    target_id: str
    rel_type: str


# ─── Device manifest (FR-99…101) ────────────────────────────────────────────


class DeviceManifestSeriesRule(BaseModel):
    type: str
    params: dict[str, Any]
    severity: str = "warning"
    category: str = "safety"


class DeviceManifestSeries(BaseModel):
    name: str
    unit: str
    kind: str = "gauge"  # gauge | counter | state | manual
    critical: bool = False
    stale_after_seconds: int | None = None
    default_rules: list[DeviceManifestSeriesRule] = Field(default_factory=list)


class DeviceManifest(BaseModel):
    device_id: str
    asset_id: str
    vendor: str | None = None
    series: list[DeviceManifestSeries]


class PendingDeviceItem(BaseModel):
    asset_id: str
    asset_name: str
    station_id: str
    category: str
    manifest: dict[str, Any] | None
    last_seen: datetime | None

    model_config = {"from_attributes": True}


# ─── Heartbeat / telemetry ──────────────────────────────────────────────────


class ReadingPayload(BaseModel):
    values: dict[str, float] = Field(default_factory=dict)
    units: dict[str, str] | None = None


class HeartbeatRequest(BaseModel):
    asset_id: str
    timestamp: datetime
    reading: ReadingPayload
    status: str = "ok"
    simulation_active: bool = False
    simulation_type: str | None = None


class AlertSummary(BaseModel):
    id: str
    asset_id: str
    severity: str
    category: str
    message: str
    first_seen: datetime
    last_seen: datetime
    occurrences: int
    state: str

    model_config = {"from_attributes": True}


class CommandDelivery(BaseModel):
    """A command relayed to the device on this heartbeat, for it to execute
    and later ack/apply via POST /agent/command-result."""

    command_id: str
    action: str
    payload: dict[str, Any]


class HeartbeatResponse(BaseModel):
    received: bool
    alerts: list[AlertSummary]
    stop_simulation: bool = False
    pending_command: CommandDelivery | None = None


class CommandResultRequest(BaseModel):
    command_id: str
    success: bool
    result: dict[str, Any] = Field(default_factory=dict)


# ─── Station & Zone ──────────────────────────────────────────────────────────


class StationDetail(BaseModel):
    id: str
    name: str
    lat: float
    lon: float
    elevation_m: float | None
    established: date | None
    winter_capacity: int | None
    summer_capacity: int | None
    local_utc_offset_minutes: int
    description: str | None
    twin_model_ref: str | None
    provenance: str

    model_config = {"from_attributes": True}


class ZoneDetail(BaseModel):
    id: str
    station_id: str
    parent_id: str | None
    name: str
    kind: str
    floor: int | None
    restricted: bool
    layout: dict[str, Any] | None
    provenance: str

    model_config = {"from_attributes": True}


# ─── Asset ───────────────────────────────────────────────────────────────────


class AssetBase(BaseModel):
    name: str
    station_id: str
    zone_id: str | None
    category: str
    subtype: str | None
    manufacturer: str | None
    spec: dict[str, Any] | None
    controllable: bool
    life_safety: bool
    responsible_user: str | None


class AssetDetail(AssetBase):
    id: str
    status: str
    health_score: float
    risk_score: float
    primary_series: str | None
    primary_value: float | None
    primary_unit: str | None
    approved: bool
    provenance: str
    registered_at: datetime
    last_seen: datetime | None

    model_config = {"from_attributes": True}


class AssetListItem(BaseModel):
    id: str
    name: str
    station_id: str
    zone_id: str | None
    category: str
    subtype: str | None
    status: str
    health_score: float
    risk_score: float
    primary_value: float | None
    primary_unit: str | None
    provenance: str
    last_seen: datetime | None
    spec: dict[str, Any] | None = None

    model_config = {"from_attributes": True}


class CreateAssetRequest(BaseModel):
    name: str
    station_id: str
    zone_id: str | None = None
    category: str
    subtype: str | None = None
    manufacturer: str | None = None
    spec: dict[str, Any] | None = None
    controllable: bool = False
    life_safety: bool = False
    provenance: str = "simulated"


# ─── Readings ────────────────────────────────────────────────────────────────


class ReadingRecord(BaseModel):
    id: str
    asset_id: str
    values: dict[str, Any]
    units: dict[str, str] | None
    source: str
    entered_by: str | None
    simulation_active: bool
    simulation_type: str | None
    collected_at: datetime

    model_config = {"from_attributes": True}


class ManualReadingRequest(BaseModel):
    asset_id: str
    values: dict[str, float]
    units: dict[str, str] | None = None
    entered_by: str


# ─── Alerts & Alert Rules ────────────────────────────────────────────────────


class AlertDetail(BaseModel):
    id: str
    rule_id: str | None
    station_id: str
    asset_id: str
    series_key: str | None
    severity: str
    category: str
    message: str
    value: float | None
    first_seen: datetime
    last_seen: datetime
    occurrences: int
    state: str
    acked_by: str | None
    acked_at: datetime | None
    ack_note: str | None
    escalated_at: datetime | None

    model_config = {"from_attributes": True}


class AckAlertRequest(BaseModel):
    user: str
    note: str | None = None


class CreateAlertRuleRequest(BaseModel):
    station_id: str | None = None
    asset_id: str | None = None
    series_key: str | None = None
    type: str = Field(..., pattern="^(above|below|out_of_band|rate_of_change|stale|anomaly)$")
    params: dict[str, Any] = Field(default_factory=dict)
    severity: str = Field(..., pattern="^(info|warning|critical|emergency)$")
    category: str = Field(..., pattern="^(safety|power|environment|logistics|science|security)$")
    escalate_after_seconds: int | None = None


class AlertRuleDetail(BaseModel):
    id: str
    station_id: str | None
    asset_id: str | None
    series_key: str | None
    type: str
    params: dict[str, Any]
    severity: str
    category: str
    escalate_after_seconds: int | None
    enabled: bool
    auto_generated: bool

    model_config = {"from_attributes": True}


# ─── Commands (Remote Control, FR-9…14) ─────────────────────────────────────


class CreateCommandRequest(BaseModel):
    asset_id: str
    action: str = Field(..., pattern="^(setpoint|start|stop|mode)$")
    payload: dict[str, Any]
    issued_by: str
    issued_role: str
    issued_from: str = Field("station", pattern="^(station|hq)$")


class ApproveCommandRequest(BaseModel):
    approver: str
    approver_role: str


class CommandDetail(BaseModel):
    id: str
    station_id: str
    asset_id: str
    action: str
    payload: dict[str, Any]
    issued_by: str
    issued_role: str
    issued_from: str
    requires_second_approval: bool
    approved_by: str | None
    approved_at: datetime | None
    state: str
    expires_at: datetime
    acked_at: datetime | None
    applied_at: datetime | None
    result: dict[str, Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Twin graph (2D floor-plan / dependency graph) ──────────────────────────


class TwinSummary(BaseModel):
    station_id: str
    total_assets: int
    ok_assets: int
    degraded_assets: int
    fault_or_offline_assets: int
    avg_health_score: float
    open_alerts: int
    critical_alerts: int


class GraphAssetNode(BaseModel):
    asset_id: str
    name: str
    category: str
    station_id: str
    status: str
    health_score: float
    # Nullable: older Neo4j Asset nodes synced before zone_id was added to the
    # Cypher projection (see neo4j_client.py's _get_full_graph_tx) won't have
    # it yet. Powers the 2D twin's zone/floor-banded layout on the frontend.
    zone_id: str | None = None


class GraphEdge(BaseModel):
    source: str
    target: str
    relationship: str


class FullGraph(BaseModel):
    nodes: list[GraphAssetNode]
    edges: list[GraphEdge]


# ─── Reports ─────────────────────────────────────────────────────────────────


class ReportListItem(BaseModel):
    id: str
    report_type: str
    station_id: str | None
    asset_id: str | None
    title: str
    generated_at: datetime

    model_config = {"from_attributes": True}


class ReportDetail(BaseModel):
    id: str
    report_type: str
    station_id: str | None
    asset_id: str | None
    title: str
    content_json: dict[str, Any]
    text_summary: str | None
    generated_at: datetime

    model_config = {"from_attributes": True}


class GenerateReportRequest(BaseModel):
    report_type: str = Field(..., pattern="^(health|risk|environmental|daily_brief)$")
    station_id: str | None = None
    asset_id: str | None = None
    range_from: datetime | None = None
    range_to: datetime | None = None


# ─── Scenarios (What-If + Cost Factor, FR-82…88) ────────────────────────────


class RunScenarioRequest(BaseModel):
    station_id: str
    name: str
    preset: str | None = Field(
        None, pattern="^(resupply_fails|generator_fails_winter|medical_evacuation|convoy_stranded|extended_storm)$"
    )
    horizon_days: int = 90
    inputs: dict[str, Any] = Field(default_factory=dict)
    created_by: str | None = None


class ScenarioDetail(BaseModel):
    id: str
    station_id: str
    name: str
    preset: str | None
    horizon_days: int
    inputs: dict[str, Any]
    status: str
    outputs: dict[str, Any] | None
    fuel_endurance_days: float | None
    food_endurance_days: float | None
    survivability_verdict: str | None
    first_failure_at_day: int | None
    first_failure_cause: str | None
    cost_inr: float | None
    carbon_kg_co2e: float | None
    created_by: str | None
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


# ─── Dependency / Blast Radius ───────────────────────────────────────────────


class DependencyAsset(BaseModel):
    asset_id: str
    name: str
    category: str
    status: str
    health_score: float
    relationship: str | None = None
    depth: int | None = None


class BlastRadius(BaseModel):
    origin_asset_id: str
    affected_count: int
    affected_assets: list[DependencyAsset]


# ─── Predictive / Risk / Diagnosis ──────────────────────────────────────────


class RiskFactor(BaseModel):
    name: str
    label: str
    score: float
    weight: float
    evidence: str


class RiskCellDetail(BaseModel):
    id: str
    station_id: str
    zone_id: str | None
    subsystem: str
    score: float
    factors: list[dict[str, Any]]
    computed_at: datetime

    model_config = {"from_attributes": True}


class DiagnoseRequest(BaseModel):
    category: str
    subtype: str | None = None
    asset_id: str | None = None
    alert_id: str | None = None
    observed_evidence: dict[str, bool] = Field(default_factory=dict)


class DiagnoseCause(BaseModel):
    cause: str
    score_pct: float
    matched_evidence: list[str]
    all_evidence_considered: list[str]
    check_sequence: list[str]


class DiagnoseResponse(BaseModel):
    fault: str
    causes: list[DiagnoseCause]


# ─── Logistics: inventory, convoys, waste, advisories ───────────────────────


class InventoryItemDetail(BaseModel):
    id: str
    station_id: str
    zone_id: str | None
    kind: str
    subtype: str | None
    name: str
    quantity: float
    unit: str
    capacity: float | None
    reserve_class: str
    expiry: date | None
    last_checked: datetime | None
    checked_by: str | None
    provenance: str

    model_config = {"from_attributes": True}


class InventoryCountRequest(BaseModel):
    quantity: float
    checked_by: str


class ConvoyAssignmentDetail(BaseModel):
    member_name: str
    vehicle_asset_id: str | None
    equipment_charge: str | None

    model_config = {"from_attributes": True}


class ConvoyDetail(BaseModel):
    id: str
    station_id: str
    season: str | None
    planned_start: datetime | None
    route_ref: str | None
    distance_km: float | None
    state: str
    medical_officer: str | None
    eta: datetime | None
    fuel_used_l: float | None
    fuel_planned_l: float | None
    assignments: list[ConvoyAssignmentDetail]

    model_config = {"from_attributes": True}


class CreateConvoyRequest(BaseModel):
    id: str
    station_id: str
    season: str | None = None
    planned_start: datetime | None = None
    route_ref: str | None = None
    distance_km: float | None = None
    medical_officer: str | None = None
    fuel_planned_l: float | None = None


class AssignConvoyRequest(BaseModel):
    member_name: str
    vehicle_asset_id: str | None = None
    equipment_charge: str | None = None


class WasteRecordDetail(BaseModel):
    id: str
    station_id: str
    stream: str
    mass_kg: float | None
    volume_l: float | None
    container_id: str | None
    processed_at: datetime
    disposition: str
    recorded_by: str | None

    model_config = {"from_attributes": True}


class CreateWasteRecordRequest(BaseModel):
    station_id: str
    stream: str = Field(..., pattern="^(paper|plastic|metal|glass|food|hazardous)$")
    mass_kg: float | None = None
    volume_l: float | None = None
    container_id: str | None = None
    disposition: str = Field("stored", pattern="^(stored|compacted|backloaded)$")
    recorded_by: str | None = None


class AdvisoryDetail(BaseModel):
    id: str
    station_id: str
    kind: str
    message: str
    saving_litres: float | None
    saving_kwh: float | None
    saving_kgco2e: float | None
    saving_inr: float | None
    proposed_command: dict[str, Any] | None
    state: str
    created_at: datetime
    decided_by: str | None
    decided_at: datetime | None

    model_config = {"from_attributes": True}


class DecideAdvisoryRequest(BaseModel):
    decided_by: str


# ─── Audit ───────────────────────────────────────────────────────────────────


class AuditEventDetail(BaseModel):
    seq: int
    ts: datetime
    user_id: str | None
    role: str | None
    station_id: str | None
    action: str
    resource: str | None
    detail: dict[str, Any] | None

    model_config = {"from_attributes": True}


class AuditVerifyResponse(BaseModel):
    valid: bool
    first_break_seq: int | None
    checked: int


# ─── Maintenance events / passport ──────────────────────────────────────────


class LogMaintenanceRequest(BaseModel):
    event_type: str = Field(..., pattern="^(maintenance|fault)$")
    description: str
    fault_code: str | None = None
    logged_by: str | None = None


class MaintenanceEventDetail(BaseModel):
    event_type: str
    description: str
    fault_code: str | None
    logged_by: str | None
    logged_at: datetime

    model_config = {"from_attributes": True}


# ─── Notification recipients (email alerting config) ───────────────────────

_EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class NotificationRecipientDetail(BaseModel):
    id: str
    email: str
    name: str | None
    station_id: str | None
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class CreateNotificationRecipientRequest(BaseModel):
    email: str = Field(..., pattern=_EMAIL_PATTERN)
    name: str | None = None
    station_id: str | None = None
    active: bool = True


class UpdateNotificationRecipientRequest(BaseModel):
    email: str | None = Field(default=None, pattern=_EMAIL_PATTERN)
    name: str | None = None
    station_id: str | None = None
    active: bool | None = None


class SendTestNotificationRequest(BaseModel):
    # If omitted, the test fires to every active recipient (station-matching
    # or station-null) instead of a single one-off address.
    email: str | None = Field(default=None, pattern=_EMAIL_PATTERN)
    station_id: str | None = None


# ─── WebSocket ───────────────────────────────────────────────────────────────


class WSEvent(BaseModel):
    event: str  # reading.updated | alert.triggered | asset.status_changed | ...
    asset_id: str | None = None
    data: dict[str, Any]
