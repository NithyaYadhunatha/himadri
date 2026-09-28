# HIMADRI

**Digital twin and remote-management platform for India's Antarctic research
stations, Maitri and Bharati** — real-time asset health, guided fault
diagnosis, what-if scenario simulation, logistics endurance forecasting, and
audited two-phase remote actuation, built for **PS 26060 (ISRO / NCPOR)**,
**Smart India Hackathon 2026**.

This repository is the **backend only**: FastAPI + PostgreSQL + Neo4j, plus
a standalone PySide6 device agent. The frontend (Next.js — owns the UI,
authentication and RBAC) is a separate repository. See
`context/PROJECT_CONTEXT.md` for the full "Backend/Frontend Boundary"
explanation — this backend never learns about users, roles, or accounts.

---

## Architecture

```
+-----------------------------------------------------------------------+
|                            HIMADRI Backend                            |
|                                                                       |
|  +----------------------------------------------------------------+   |
|  |                    FastAPI (async)                              |   |
|  |  /agent  /stations  /assets  /alerts  /commands  /scenarios     |   |
|  |  /analytics  /logistics  /reports  /devices  /audit             |   |
|  |  /model-accuracy   /ws (WebSocket)   /mcp (natural-lang agent)  |   |
|  +----------------------------------------------------------------+   |
|  +----------------------------------------------------------------+   |
|  |  services/ingest_engine.py — shared reading->alert->risk->graph  |  |
|  |  ->WS pipeline, called by BOTH telemetry entry points below      |  |
|  +----------------------------------------------------------------+   |
|  +---------------------------+   +----------------------------+       |
|  |      PostgreSQL 16        |   |          Neo4j 5            |      |
|  |  stations | zones | assets|   |   Asset dependency graph    |      |
|  |  readings | alerts        |   |   (DEPENDS_ON / USES / ...) |      |
|  |  commands | audit_events  |   |   Blast-radius queries      |      |
|  |  scenarios | inventory... |   |                              |      |
|  +---------------------------+   +----------------------------+       |
+-----------------------------------------------------------------------+
        ^  REST + WS (HeartbeatRequest/Response)     ^  MQTT (Mosquitto)
        |                                             |  himadri/{station}/
+-------+----------------------------+   +------------+-----------------+
|   agent/ — HIMADRI Station Device   |   |   Real sensor gateways /      |
|   Agent. Represents ONE physical    |   |   third-party hardware.       |
|   asset (generator, fuel tank,      |   |   Publish directly over MQTT  |
|   freezer, AWS, PistenBully...).    |   |   — no bespoke client needed. |
|   Reports SYNTHETIC readings        |   |   See "Device Connectivity"   |
|   anchored to documented ranges.    |   |   below for the topic/payload |
|   PySide6 GUI. Demo/simulator path. |   |   contract.                   |
+--------------------------------------+   +--------------------------------+
```

---

## Quickstart: Backend

```bash
# 1. Copy environment config (create your own .env — see backend/config.py
#    for every setting and its default)

# 2. Start all services (PostgreSQL + Neo4j + Redis + Mongo + Mosquitto + Backend)
docker compose up -d

# 3. The backend container seeds a minimal starter set automatically
#    (scripts/init_db.py). For a rich, demo-ready topology, also run:
python scripts/seed_himadri_demo.py
python scripts/seed_predictive_maintenance_demo.py   # needs the backend already running
```

Backend: **http://localhost:8000** · API docs: **http://localhost:8000/docs**
· Neo4j browser: **http://localhost:7474** (user: `neo4j` / pass: `himadri`)

> No Docker/Python interpreter was available to actually run any of this in
> the environment the current codebase was last edited in — see
> `context/DEVELOPMENT_STATUS.md`'s "Verification" section before you demo.

---

## Quickstart: Device Agent

```bash
cd agent
pip install -r requirements.txt
python agent.py
```

The agent asks for an **Asset ID + API Key** — these come from registering
an asset first (`POST /agent/register`, Bearer-protected — this is normally
done from the HIMADRI frontend's "Connect New Device" flow, or directly via
`/docs`). The agent never registers an asset itself. Once connected, it
starts reporting synthetic telemetry matching that asset's category/subtype
every `report_interval_seconds` (default 10s, see `agent/config/device.yaml`).

### Fault-injection buttons

| Button | Targets | What it does |
|---|---|---|
| Generator Fault | power/generator | `power_kw` ramps down, `fuel_lph` ramps up (fuel starvation) |
| Freezer Warming | storage/freezer, chiller | `temp_c` climbs toward 0 |
| Fuel Leak | storage/fuel_tank | `level_l` drains far faster than normal |
| Instrument Dropout | any instrument | readings freeze at their fault-start values |
| PistenBully Coolant Fault | vehicle/pistenbully | `coolant_c` spikes, `fault_code` goes nonzero |

All five are **100% synthetic** — the agent never touches real system or
hardware resources. Each matches a curated rule in
`backend/services/diagnosis_engine.py`, so triggering one and then calling
`POST /analytics/diagnose` tells the same story end-to-end.

---

## Device Connectivity

HIMADRI has **two** telemetry ingest paths into the same backend pipeline
(`backend/services/ingest_engine.py`: reading -> alert rules -> risk/health
-> Neo4j graph -> WebSocket broadcast). Both converge there — neither is a
second, differently-behaving copy of the other:

| Path | Who uses it | Transport |
|---|---|---|
| `POST /agent/heartbeat` | The demo/simulator `agent/` PySide6 app | HTTP, `X-API-Key` |
| MQTT (Mosquitto) | Real sensor gateways / third-party hardware | `himadri/{station_id}/{asset_id}/{series_name}` topics |

The HTTP heartbeat path is **unchanged** by the MQTT addition — it remains
the device agent's real transport and the demo/simulator path.

### MQTT topic & payload contract

`backend/services/mqtt_ingest.py` subscribes to `himadri/+/+/+` on the
Mosquitto broker (`MQTT_BROKER_HOST`/`MQTT_BROKER_PORT`, default
`localhost:1883`, docker-compose overrides to the `mosquitto` service).

- **Topic:** `himadri/{station_id}/{asset_id}/{series_name}`
- **Payload (JSON):**
  ```json
  {
    "ts": "2026-09-21T08:00:00Z",
    "value": 41.2,
    "unit": "kW",
    "source": "sensor",
    "quality": 100,
    "device_id": "gw-01"
  }
  ```
  `source` is one of `sensor` | `manual` | `simulated`; `quality` is an
  integer 0-100.
- **Unit validation:** if the asset has a self-describing manifest (`POST
  /devices/manifest`, FR-100) that declares this `series_name`, the
  payload's `unit` must match it exactly or the message is **rejected, never
  coerced**. An asset with no manifest yet — most seed/demo assets — accepts
  the reading unvalidated rather than losing MQTT ingest until it's
  onboarded with one.
- **Unknown `asset_id`:** logged and dropped. MQTT has no per-message API
  key the way `/agent/heartbeat` does, so there's no safe way to
  auto-create an Asset row from bare telemetry (no identity/category/
  station beyond a few strings) — register the asset and its manifest
  first (`POST /agent/register` + `POST /devices/manifest`).
- **Known but unapproved `asset_id`** (`Asset.approved == false`, the FR-101
  pending-device queue): logged and dropped until `POST
  /devices/{asset_id}/approve`.
- **Malformed topic or payload:** logged and dropped — the listener never
  crashes on bad input.

`quality` and `device_id` are logged but not persisted — the `Reading`/
`Asset` schema (`backend/models/tables.py`) has no columns for them yet;
see `context/DEVELOPMENT_STATUS.md` for this noted as a known gap rather
than silently dropped.

> This was written and reviewed without a live Mosquitto broker or
> database to test against — see "Verification" in
> `context/DEVELOPMENT_STATUS.md` before you demo it.

---

## API Cheatsheet

The REST contract from *PolarTwin — Data Model & API Contract* is exposed at
`/api/v1`. The existing root paths remain available for the current Next.js
frontend and device agent. `/docs` describes the versioned routes. Responses
under `/api/v1` include `X-Node-Id` and `X-Link-State`; HTTP errors use the
contract's `error.code`, `error.message`, and `error.request_id` envelope.

The v1 additions include station model, QR SVG, series and latest readings,
manual readings, energy views, environmental CSV/PDF export, forecasting,
simulation, agent fallback queries, convoy updates, and a durable sync queue.
Set `HQ_SYNC_URL` to enable `POST /api/v1/sync/now`; without it the route
returns a service-unavailable error. The HQ batch receiver verifies hashes
and stores incoming items, but does not yet materialize them into domain
tables. Audit events enter the outgoing queue; other table changes still need
queue hooks. The identity routes (`/auth/*`, `/users*`) remain open because
the current app uses Clerk/MongoDB rather than the PDF's JWT user store.

Base URL: `http://localhost:8000` · Auth: `Authorization: Bearer <API_SECRET_KEY>`
on every route below except `/health` and `/agent/*` (which use `X-API-Key`).

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check — no auth |
| POST | `/agent/register` | Create a new asset (Bearer — admin/frontend only) |
| GET | `/agent/whoami` | Identify the caller from its `X-API-Key` |
| POST | `/agent/heartbeat` | Device telemetry ingest, demo/simulator path (`X-API-Key`) |
| POST | `/agent/command-result` | Device command ack/apply (`X-API-Key`) |
| POST | `/api/v1/telemetry/ingest` | PolarTwin Raspberry Pi batch ingest (`X-Device-Key`); `/api/telemetry/ingest` remains a compatibility alias |
| MQTT | `himadri/{station_id}/{asset_id}/{series_name}` | Real sensor/gateway telemetry ingest — no HTTP route, see "Device Connectivity" above |
| GET | `/stations`, `/stations/{id}` | Station detail, zones, twin graph |
| GET | `/assets`, `/assets/{id}` | Asset list/detail, readings, dependencies, blast radius |
| POST | `/assets` | Create an asset |
| GET | `/alerts` | List/filter alerts |
| POST | `/alerts/{id}/ack`, `/alerts/{id}/resolve` | Acknowledge or resolve an alert |
| GET/POST/PATCH | `/alert-rules` | Threshold rule CRUD |
| POST | `/alerts/escalate-due` | Sweep unacked Critical/Emergency alerts past their timer |
| POST/GET | `/commands` | Issue, approve, list two-phase actuation commands |
| GET/POST | `/scenarios` | Presets, run a what-if scenario, compare results |
| GET | `/analytics/risk` | Antarctic Risk Heatmap |
| POST | `/analytics/diagnose` | Guided fault diagnosis |
| GET/POST | `/inventory`, `/convoys`, `/waste`, `/advisories` | Fuel/food/spares, convoys, waste streams, savings advisories |
| GET | `/logistics/endurance`, `/vehicles` | Endurance forecast, vehicle fleet |
| GET/POST | `/reports` | Health/risk/environmental/daily-brief reports |
| GET | `/devices?pending=true` | Pending-device approval queue |
| POST | `/devices/manifest`, `/devices/{id}/approve` | Register a self-describing manifest, approve a pending device |
| GET | `/audit`, `/audit/verify` | Hash-chained audit log, chain integrity check |
| GET/POST | `/model-accuracy/{accuracy,forecast,predictions,drift}`, `/model-accuracy/retrain` | Predictive maintenance |
| WS | `/ws` | Real-time event stream |
| POST/GET | `/mcp` | MCP server for the natural-language Operations Agent (read-only tool subset) |

---

## Project Structure

```
InfraMind.py/
|-- agent/                       # HIMADRI Station Device Agent (PySide6)
|   |-- agent.py                 # Entry point: python agent.py
|   |-- core/
|   |   |-- collector.py         # Synthetic Antarctic reading generator
|   |   |-- simulator.py         # 5 Antarctic fault injections
|   |   |-- heartbeat.py         # Background heartbeat + command round trip
|   |   |-- registration.py      # GET /agent/whoami auth
|   |   \-- device_store.py      # Local asset-identity cache
|   |-- gui/
|   |   |-- main_window.py       # PySide6 main window
|   |   \-- setup_dialog.py      # Connect dialog (Asset ID + API Key)
|   |-- config/device.yaml       # Connection defaults
|   \-- requirements.txt
|-- backend/
|   |-- main.py                  # FastAPI app, lifespan (Postgres/Neo4j/MQTT), offline detection, MCP
|   |-- config.py                # Settings from .env
|   |-- dependencies.py          # Auth + rate limiting
|   |-- routers/                 # HTTP surface (13 routers)
|   |-- services/                # Business logic (risk, alert, dependency,
|   |   |                        #   scenario, command, audit, diagnosis,
|   |   |                        #   report, passport engines, ingest_engine
|   |   |                        #   [shared heartbeat+MQTT pipeline],
|   |   |                        #   mqtt_ingest [Mosquitto listener])
|   |-- database/                # PostgreSQL + Neo4j clients
|   |-- models/tables.py         # SQLAlchemy ORM (Station/Zone/Asset/...)
|   |-- schemas/schemas.py       # Pydantic v2 schemas
|   |-- websocket/manager.py     # WS connection pool
|   |-- analysis/                # Predictive-maintenance ML pipeline
|   \-- requirements.txt
|-- scripts/
|   |-- init_db.py               # Minimal starter seed (both stations)
|   |-- init_graph.py            # Matching minimal Neo4j seed
|   |-- seed_himadri_demo.py     # Rich Maitri + Bharati demo topology
|   \-- seed_predictive_maintenance_demo.py  # ML demo history + training
|-- context/
|   |-- PROJECT_CONTEXT.md       # AI agent memory — read first
|   |-- DEVELOPMENT_STATUS.md    # Build progress + verification checklist
|   \-- BACKLOG.md                # Open items
|-- mosquitto/mosquitto.conf     # Mosquitto broker config (anonymous, demo-only)
|-- docker-compose.yml
\-- README.md
```

---

## WebSocket Events

Connect to `ws://localhost:8000/ws`:

```json
{"event": "reading.updated", "asset_id": "...", "data": {"power_kw": 41.2, "...": "..."}}
{"event": "alert.triggered", "asset_id": "...", "data": {"severity": "critical", "message": "..."}}
{"event": "asset.status_changed", "asset_id": "...", "data": {"status": "fault", "health_score": 40.0}}
{"event": "asset.registered", "data": {"asset_id": "...", "name": "...", "category": "..."}}
{"event": "command.updated", "asset_id": "...", "data": {"command_id": "...", "state": "applied"}}
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `docker compose up` fails | Check Docker Desktop is running |
| Agent can't reach backend | Set `backend_url` in `agent/config/device.yaml` (or the connect dialog) to the host machine's IP, not `localhost`, for a multi-machine demo |
| Neo4j graph empty after seeding | Wait for the `neo4j` container's healthcheck to pass before running `scripts/init_graph.py` |
| Port 8000 in use | Change the backend port in `docker-compose.yml` and the agent's `backend_url` |
| `/model-accuracy/*` all zeroed | No production model yet — run `scripts/seed_predictive_maintenance_demo.py` or `POST /model-accuracy/retrain` once there's real `Reading`/`Alert` history |
| PySide6 install fails | Use Python 3.12+; on Windows `pip install PySide6` should work directly |
| MQTT readings never show up | Confirm the asset exists and `approved: true` (`GET /devices`), and that the topic is exactly `himadri/{station_id}/{asset_id}/{series_name}` — check backend logs for `mqtt_ingest.*` warnings (unknown asset, unit mismatch, malformed payload, etc.) |
| `mqtt_ingest.broker_unreachable` in logs | Non-fatal by design (see "Device Connectivity") — confirm the `mosquitto` container is up and `MQTT_BROKER_HOST`/`MQTT_BROKER_PORT` point at it; the listener retries every 5s on its own |
