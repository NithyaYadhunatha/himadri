⚠️  AI AGENT INSTRUCTIONS — READ BEFORE WRITING ANY CODE
1. Read PROJECT_CONTEXT.md fully — understand what you are building and why
2. Read DEVELOPMENT_STATUS.md — find the first unchecked task in the lowest incomplete phase
3. Complete that task fully — no partial implementations, no TODOs
4. Mark the task as [x] done in DEVELOPMENT_STATUS.md
5. Recalculate and update the Overall Progress % and phase Progress %
6. Add your note to AGENT NOTES before finishing
7. Never duplicate a module that already exists — check existing files first
8. Never start a new phase if the previous phase has unchecked tasks

---

# HIMADRI — Project Context

## What is HIMADRI

HIMADRI is a digital twin and remote-management platform for India's two
permanent Antarctic research stations, **Maitri** (Schirmacher Oasis, Queen
Maud Land, operational since 1989) and **Bharati** (Larsemann Hills, Prydz
Bay, operational since 2012). It is built for **PS 26060**, a problem
statement sponsored by **ISRO / NCPOR** (National Centre for Polar and
Ocean Research) for **Smart India Hackathon 2026**.

Unlike a conventional IT infrastructure monitoring tool, HIMADRI models the
*physical* systems that keep an Antarctic station survivable: power
generation and fuel reserves, heating, water and waste treatment, the
vehicle fleet, scientific instruments, medical facilities, and logistics
(inventory, resupply convoys, waste streams). The goal is to give station
leadership and HQ (India) a real-time, remotely-queryable picture of
station health, a way to reason about "what if" scenarios (a failed
generator mid-winter, a stranded resupply convoy, an extended storm), and a
guided path from an anomaly to a diagnosis to a safe remote action —
without ever letting an unattended system take a life-safety action alone.

This repository (`InfraMind.py`) is the **backend only**: a FastAPI +
PostgreSQL + Neo4j service. A separate Next.js frontend (not in this repo)
owns the UI, authentication, and RBAC — see "Backend/Frontend Boundary"
below, which is a deliberate, load-bearing architecture decision, not an
oversight.

## Problem Being Solved

Both stations run on infrastructure that is expensive, slow, and sometimes
impossible to physically inspect or resupply for months at a time (the
winter crew is a few dozen people; a failed generator, a fuel leak, or a
freezer warming past its safe band can become a life-safety issue before a
human notices). Today, most of this is tracked informally. HIMADRI aims to:

- Give a live, single-pane view of every tracked asset's health, risk, and
  telemetry at both stations (**TWIN**)
- Alert on threshold breaches, stale data, and injected/real faults before
  they become emergencies (**ALR**)
- Model physical dependencies (a heater depends on a generator; a
  generator uses a fuel tank) so a failure's blast radius is computable,
  not guessed (part of **TWIN**)
- Let a human run "what-if" scenarios — generator failure mid-winter,
  convoy stranded, extended storm — and see fuel/food endurance and
  survivability before it happens for real (**SIM**)
- Track fuel, food, and spares endurance and logistics (convoys, waste
  streams) explicitly, since resupply is not "next day" here (**PNR**)
- Provide a guided fault-diagnosis knowledge base for real documented
  failure modes (PistenBully cold-start faults, STP stage stalls, AHU
  filter fouling...) instead of relying on tribal knowledge (part of
  **PRED**)
- Support safe two-phase remote actuation (setpoint/start/stop/mode) with
  mandatory second approval for anything life-safety-flagged, and a
  tamper-evident hash-chained audit log of every action (**RBAC** for the
  gate itself, audited here; the identity/role behind an action is decided
  by the frontend)
- Run a real (non-toy) predictive-maintenance ML pipeline over telemetry
  history so failures are anticipated, not just reacted to (**PRED**)
- Let each physical device onboard itself via a self-describing manifest
  and QR-coded identity instead of a code change per new instrument
  (**QR**, **DEV**, FR-99…101)
- Offer a natural-language Operations Agent (via MCP) that can answer
  "what's the fuel endurance at Maitri if resupply is delayed 30 days" by
  querying this backend's own read/report/simulation endpoints — never
  actuating anything itself (**AGENT**)

## SRS Module Codes

The project's SRS organizes requirements under these module codes, referenced
throughout this backend's code comments (e.g. "FR-71", "FR-99…101"):

| Code    | Module                                                              |
|---------|----------------------------------------------------------------------|
| TWIN    | Digital twin: stations, zones, assets, dependency graph, live status |
| PNR     | Planning & logistics: inventory, convoys, waste, endurance forecasts |
| SUP     | Supply/resupply chain concerns (convoys, endurance) — overlaps PNR    |
| ENV     | Environmental telemetry (weather, magnetometry, radiation...)        |
| ALR     | Alerting: rules, thresholds, escalation, dedup                       |
| RBAC    | Role/permission gating on mutating actions (identity itself is the frontend's) |
| PRED    | Predictive maintenance & guided fault diagnosis                      |
| SIM     | What-if scenario simulation                                          |
| AGENT   | Device agent (telemetry reporting) + the natural-language Ops Agent (MCP) |
| QR      | Physical asset identity via QR code (Asset.id is the QR payload)      |
| DEV     | Device onboarding: registration, manifests, approval queue           |

## Tech Stack

- Backend: Python 3.12, FastAPI (async), SQLAlchemy 2.x async, Pydantic v2
- Graph DB: Neo4j 5 (all dependency logic via `GraphService` —
  `backend/database/neo4j_client.py` — never raw Cypher in routes)
- Relational DB: PostgreSQL 16, plain `postgres:16` container in this
  repo's own `docker-compose.yml`
- Cache: Redis 7 (container included; not yet load-bearing for any
  backend feature — see DEVELOPMENT_STATUS.md)
- MQTT broker: Mosquitto 2 (`eclipse-mosquitto:2`, anonymous access,
  hackathon/demo config — `mosquitto/mosquitto.conf`), consumed via the
  `aiomqtt` client library (`backend/services/mqtt_ingest.py`) — see
  "Device Connectivity" below
- Device agent: PySide6 desktop app (`agent/`) reporting **synthetic**
  Antarctic instrument/equipment telemetry — see "Device Agent" below.
  psutil (real OS metrics) has been fully removed; nothing in this repo
  reads a real host's CPU/memory/disk anymore.
- ML: scikit-learn (RandomForest classifier + regressor), pandas
- Containerization: Docker + docker-compose
- Frontend: Next.js (separate repo, not in this codebase) — backend
  exposes REST + WebSocket + an MCP server for it

## Device Connectivity (HTTP heartbeat + MQTT)

Two telemetry ingest paths converge on the same pipeline
(`backend/services/ingest_engine.py`: create the `Reading`, evaluate
`AlertRule`s, recompute risk/health, update the Neo4j graph, broadcast WS
events):

- **`POST /agent/heartbeat`** (`backend/routers/agents.py`) — the demo/
  simulator `agent/` PySide6 app's transport, `X-API-Key` auth. Unchanged
  by the MQTT addition below; still the device agent's real transport.
- **MQTT** (`backend/services/mqtt_ingest.py`, Mosquitto broker) — added
  for "remote management": real sensor gateways/third-party hardware
  publish directly, no bespoke client needed. This reverses this backend's
  earlier deliberate deviation from the project's original architecture
  brief (which specified MQTT) toward an HTTP-only heartbeat — that
  deviation stands for the device agent's own transport, but MQTT is now
  the recommended path for anything that isn't the demo agent.
  - Topic: `himadri/{station_id}/{asset_id}/{series_name}`
  - Payload: `{"ts": "<ISO8601>", "value": <number>, "unit": "<string>",
    "source": "sensor"|"manual"|"simulated", "quality": <int 0-100>,
    "device_id": "<string>"}`
  - Unit is validated against the asset's manifest-declared unit for that
    series if one exists (`Asset.manifest`, FR-100) — rejected, never
    coerced, on mismatch. No manifest for that series yet: accepted
    unvalidated (most seed/demo assets have no manifest, so this avoids
    disabling MQTT ingest wholesale until manifests are more widely
    adopted).
  - Unknown `asset_id` or a known-but-unapproved one (`Asset.approved ==
    false`, FR-101 pending-device queue): logged and dropped, never
    auto-created from bare telemetry.
  - `MQTT_ENABLED`/`MQTT_BROKER_HOST`/`MQTT_BROKER_PORT` in
    `backend/config.py`; non-fatal if Mosquitto is unreachable at startup
    or drops mid-session — the listener retries forever in the background
    and the HTTP heartbeat path never depends on it.
  - `quality`/`device_id` are logged, not persisted — no columns for them
    on `Reading`/`Asset` in the current schema (a known, flagged gap, not
    a schema change made unilaterally — see DEVELOPMENT_STATUS.md).
  - **Written and reviewed without a live Mosquitto broker or database to
    test against** — same "no working interpreter/Docker in this
    environment" caveat as the rest of this backend's own Verification
    notes.

## Device Agent (`agent/`)

`agent/` is a standalone PySide6 desktop app — the "HIMADRI Station Device
Agent" — that represents **one** physical station asset (a generator, a
fuel tank, a freezer, an AWS weather station, a PistenBully...) and reports
its telemetry to this backend over HTTP, matching the exact
`HeartbeatRequest`/`HeartbeatResponse` contract in
`backend/schemas/schemas.py`.

It never registers itself — an asset is created admin-side (POST
`/agent/register`, Bearer-protected) and the resulting Asset ID + API Key
are pasted into the agent's connect dialog. From there:

- `agent/core/collector.py` — generates SYNTHETIC reading values per the
  asset's category/subtype (a generator reports `power_kw`/`runhours`/
  `fuel_lph`; a freezer reports `temp_c`; an AWS reports `temp_c`/
  `pressure_hpa`/`wind_ms`/`wind_dir`/`rh_pct`; a magnetometer reports
  `h_nt`/`d_nt`/`z_nt`; a PistenBully reports `runhours`/`coolant_c`/
  `fault_code`...), anchored to real documented ranges where the project's
  own source material gives one. This module never touches real system
  resources — it is pure number generation via a bounded random walk.
- `agent/core/simulator.py` — five Antarctic fault injections matching
  `backend/services/diagnosis_engine.py`'s curated rule keys:
  `generator_fault`, `freezer_warming`, `fuel_leak`,
  `instrument_dropout`, `pb_coolant_fault`. Same safety rule as the old
  IT-metric simulator it replaced: never touches real OS resources, only
  overrides the synthetic values in the heartbeat payload.
- `agent/core/heartbeat.py` — periodic POST `/agent/heartbeat`; also
  completes the real actuation round trip (delivers a queued `Command` via
  `pending_command`, applies it to local synthetic state, POSTs the result
  back via `/agent/command-result`).
- `agent/core/registration.py` / `agent/core/device_store.py` —
  authenticate an existing Asset ID + API Key (GET `/agent/whoami`) and
  cache it locally for next launch.
- `agent/gui/` — the PySide6 window: connection info, live readings, an
  Asset Category selector (demo-only — see its own docstring for why it
  can't actually change the asset's category on the backend), and the 5
  fault-injection buttons.
- `agent/config/device.yaml` — connection defaults (backend URL, heartbeat
  interval).

## Predictive Maintenance (ML)

Real (not stubbed) failure-prediction pipeline. Routes live under
`/model-accuracy` (kept as a plain, stable prefix — no historical URL
constraint here since this is a fresh build, unlike the InfraMind lineage
this repo started from).

- `backend/analysis/data_loader.py` — pulls `Reading`/`Alert` rows out of
  Postgres into pandas DataFrames. Readings are heterogeneous across asset
  categories (litres, °C, kW, nT...), so this takes each Reading's FIRST
  declared series value as "the" generic numeric value for the pipeline
  (matches each asset's own `primary_series` convention when readings are
  constructed with that key first).
- `backend/analysis/feature_engineering.py` — resampled rolling mean/slope
  features (`FEATURE_COLS`); `build_training_features()` labels each row
  `label_failure_24h` / `time_to_failure_min` from whichever
  Critical/Emergency alert follows it; `extract_latest_features()` gives
  the latest feature vector per asset for live inference.
- `backend/analysis/train.py` — RandomForestClassifier (24h failure
  probability) + RandomForestRegressor (time-to-failure), chronological
  80/20 split, pickled to `backend/models/artifacts/<version>.pkl`,
  registered as a new `ml_model_versions` row with status "production".
- `backend/analysis/predict.py` — loads the current production model,
  scores every asset's latest features, persists `ml_predictions`, returns
  a forecast dict (risk_level LOW/MEDIUM/HIGH/CRITICAL per asset).
- `backend/analysis/weekly_job.py` — standalone/cron-triggered training
  entrypoint; there is no in-process scheduler for this yet.
- Tables: `ml_model_versions`, `ml_predictions`, `ml_prediction_outcomes`
  (`backend/models/tables.py`), asset-scoped.
- Routes: `backend/routers/predictive_maintenance.py` — GET
  `/model-accuracy/{accuracy,forecast,predictions,drift}`, POST
  `/model-accuracy/retrain`.
- Needs a meaningful amount of `Reading`/`Alert` history before training
  produces anything useful — `run_training()` returns
  `{"status": "INSUFFICIENT_DATA"}` rather than failing when there isn't
  enough yet. `scripts/seed_predictive_maintenance_demo.py` backfills a
  realistic 20-day history for a handful of demo assets specifically so
  this dashboard has real data to show.

## Backend/Frontend Boundary (deliberate, load-bearing)

This backend **never** learns about users, roles, departments, or
accounts. User identity and RBAC live entirely in the separate Next.js
frontend. Every mutating endpoint here takes a plain string
`issued_by`/`approved_by`/`recorded_by`/etc. — a name the frontend already
knows, not a foreign key into a users table this backend doesn't have.
Authentication at this layer is either:

- `X-API-Key` on every `/agent/*` route (per-asset key, UUID4, minted at
  registration), or
- `Authorization: Bearer <API_SECRET_KEY>` on every other route (one
  shared secret from `.env`, standing in for "the frontend, already having
  authenticated its own user, is calling on their behalf").

Do not add a users/roles table or a login endpoint to this repo. If a
future task asks for one, that's a frontend change, or a deliberate,
explicitly-discussed architecture change — not a default.

## Two-Phase Actuation & Audit (FR-9…14, NFR-14)

Any remote command (`Command` table: setpoint/start/stop/mode) that targets
a `life_safety`-flagged asset requires a second, different approver before
it is ever delivered to a device (`requires_second_approval`,
`approved_by`). Every mutating action — command issue/approve, alert ack,
scenario run, report generation, inventory count, convoy state change —
appends to `audit_events`, a hash-chained (`prev_hash`/`hash`) append-only
log (`backend/services/audit_engine.py`) so tampering with history is
detectable, not just discouraged.

## Folder Responsibilities

- `context/` — AI agent memory. Read before coding. Update after coding.
- `agent/` — standalone PySide6 device agent (see "Device Agent" above)
- `backend/` — FastAPI server: `routers/` (HTTP surface), `services/`
  (business logic — routes never contain it directly), `database/`
  (Postgres + Neo4j clients), `models/tables.py` (SQLAlchemy ORM),
  `schemas/schemas.py` (Pydantic v2), `websocket/manager.py`,
  `analysis/` (predictive-maintenance ML pipeline)
- `scripts/` — DB init, graph seed, demo data:
  - `init_db.py` / `init_graph.py` — minimal starter seed (both stations,
    one zone + three demo assets each), run automatically on every
    container start
  - `seed_himadri_demo.py` (manual-run only, NOT wired into
    docker-compose) — a rich, realistic Maitri + Bharati topology: zones,
    ~45 Maitri assets + ~18 Bharati assets, inventory, convoys, waste
    records, and alert rules. Idempotent (deterministic ids) — safe to
    rerun any time.
  - `seed_predictive_maintenance_demo.py` (run after the above, needs the
    backend container actually running) — backfills ~20 days of realistic
    telemetry history + historical Critical alerts for a small set of
    demo assets, then drives real model training through the live
    backend's own `/model-accuracy/retrain` API.
- `docker-compose.yml` — one-command environment setup (postgres, neo4j,
  redis, mongo (frontend-only, untouched by this backend), mosquitto,
  backend)
- `mosquitto/mosquitto.conf` — Mosquitto broker config (anonymous access,
  demo/hackathon posture — see "Device Connectivity" above)

## Coding Standards

- No business logic in route handlers — routes call services only
- All Neo4j access through `GraphService` — never raw Cypher in routes
- Type hints on every function signature
- Async/await throughout the backend
- Structured JSON logging (structlog)
- No hardcoded secrets — everything from `.env` / `backend/config.py`
- FastAPI lifespan context manager (not deprecated `@app.on_event`)

## Security Rules

- Each asset gets a unique `api_key` (UUID4) on registration
- All `/agent/*` routes validate `X-API-Key`
- All other routes validate `Authorization: Bearer <API_SECRET_KEY>`
- Rate limiting on the heartbeat endpoint (`require_api_key_rate_limited`)
- No secrets in code or YAML — use `.env`

## Agent Simulation Rules (CRITICAL)

The device agent's fault-injection buttons inject SYNTHETIC reading values
into the heartbeat payload. They MUST NEVER call any OS command or touch
real system/hardware resources — everything is number generation in
`agent/core/collector.py`/`simulator.py`. `simulation_active` and
`simulation_type` are always included on the heartbeat so the backend can
label data points correctly and so `feature_engineering`/dashboards never
mistake an injected fault for organic drift without knowing it was one.

## WebSocket Events

The WS `/ws` endpoint (`backend/websocket/manager.py`) pushes:
- `reading.updated` — new heartbeat reading for an asset
- `alert.triggered` — new/escalated alert
- `asset.status_changed` — asset went ok/degraded/fault/offline/simulating
- `asset.registered` — new asset registered
- `command.updated` — a Command's state changed (sent/acked/applied/failed/expired)

## MCP / Natural-Language Operations Agent

`backend/main.py` mounts an MCP server (`fastapi-mcp`) at `/mcp` exposing a
curated, **read-only** subset of routes (`MCP_TOOL_OPERATIONS`) as tools —
station/asset status, telemetry, alerts, logistics endurance, the risk
heatmap, guided diagnosis, reports, and what-if scenarios. It deliberately
excludes `/agent/register`, `/agent/heartbeat`, and every actuation route:
the natural-language agent may surface information and (per FR-91)
pre-fill a command for a human to confirm, but it never executes one
itself.

## Performance Targets

- Sub-2-second blast radius queries on the station dependency graph
- Meaningful (not necessarily state-of-the-art) predictive-maintenance
  accuracy once enough real telemetry/alert history has accumulated
- Two-phase approval and hash-chained audit adding negligible latency to
  the mutating-route hot path
