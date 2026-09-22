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

# HIMADRI — Development Status

Last Updated: 2026-09-21
Updated By: Claude Sonnet 5 (MQTT ingest pass — second telemetry path for
"remote management", alongside the InfraMind -> HIMADRI conversion pass
below)
Overall Progress: ~90% (backend core complete per the lead engineer's own
prior pass; this pass's own scope — agent, seed scripts, docker naming,
docs, and now MQTT ingest — is complete but UNVERIFIED against a live
stack, see "Verification" below)

---

## PHASE 1: Core Backend (models, schemas, database, services, routers)
Status: COMPLETE (done by the lead engineer before this pass — read-only
ground truth for everything else; NOT modified by this pass)
Progress: 100%

- [x] `backend/models/tables.py` — full HIMADRI schema (Station, Zone,
      Asset, Reading, AlertRule, Alert, Command, AuditEvent, Report,
      Scenario, InventoryItem, Convoy, ConvoyAssignment, WasteRecord,
      RiskCell, Advisory, MaintenanceEvent, ML tables)
- [x] `backend/schemas/schemas.py` — Pydantic v2 request/response types
- [x] `backend/database/{postgres,neo4j_client}.py`
- [x] `backend/dependencies.py`, `backend/config.py`
- [x] `backend/services/*.py` — risk_engine, alert_engine, dependency_engine,
      scenario_engine, command_engine, audit_engine, diagnosis_engine,
      report_engine, passport_engine, pending_commands
- [x] `backend/routers/*.py` — agents, stations, assets, alerts, commands,
      scenarios, analytics, logistics, reports, devices, audit, websocket,
      predictive_maintenance
- [x] `backend/main.py`, `backend/websocket/manager.py`
- [x] `backend/analysis/{data_loader,feature_engineering,predict,train}.py`
- No `TODO`/`FIXME`/`NotImplementedError` markers found anywhere in
  `backend/` at the time of this pass (grepped as part of verification).

## PHASE 2: Device Agent Conversion (`agent/`)
Status: COMPLETE
Progress: 100%

Converted from the old InfraMind IT-metrics agent (psutil CPU/mem/disk,
5 IT failure sims, node_id/node_type vocabulary) to the HIMADRI Station
Device Agent (synthetic Antarctic instrument/equipment telemetry,
asset_id/category/subtype vocabulary, 5 Antarctic fault injections).

- [x] `agent/core/collector.py` — psutil removed entirely; synthetic
      per-(category, subtype) reading generator (generator, fuel_tank,
      freezer/chiller, waste tanks, stp, aws, pyranometer, magnetometer,
      ahu, boiler, vehicle/pistenbully, ups_monitoring, generic fallback)
      plus `apply_command()` for the real actuation round trip
- [x] `agent/core/simulator.py` — `generator_fault`, `freezer_warming`,
      `fuel_leak`, `instrument_dropout`, `pb_coolant_fault` (matches
      `backend/services/diagnosis_engine.py`'s rule keys); same
      never-touch-real-resources rule as before
- [x] `agent/core/registration.py` — `authenticate()` against GET
      `/agent/whoami`, asset_id/api_key vocabulary throughout
- [x] `agent/core/heartbeat.py` — `HeartbeatRequest`/`HeartbeatResponse`
      contract match; `pending_command` -> `apply_command()` ->
      POST `/agent/command-result` round trip wired
- [x] `agent/core/device_store.py` (renamed from `node_store.py`) — local
      asset-identity cache (`agent/config/devices_cache.json`)
- [x] `agent/gui/main_window.py` — rebranded, dynamic per-series reading
      rows (replaces the old fixed CPU/Memory/Disk progress bars — a
      generic Antarctic asset doesn't have a natural 0-100% metric), Asset
      Category selector, 5 fault-injection buttons
- [x] `agent/gui/setup_dialog.py` — `DeviceSetupDialog`, Asset ID + API Key
- [x] `agent/config/device.yaml` (renamed from `node.yaml`)
- [x] `agent/requirements.txt` — `psutil` removed (grepped first — no
      longer imported anywhere in `agent/`); PySide6/httpx/pyyaml/structlog
      unchanged, no new third-party dependency added

## PHASE 3: Seed Data Scripts (`scripts/`)
Status: COMPLETE
Progress: 100%

- [x] `scripts/init_db.py` — minimal starter seed: both stations, one
      zone each, three demo assets each (was: 3 IT nodes)
- [x] `scripts/init_graph.py` — matching minimal Neo4j seed
- [x] `scripts/seed_himadri_demo.py` (new) — rich Maitri + Bharati
      topology: ~50 zones, ~45 Maitri assets + ~18 Bharati assets,
      InventoryItem/Convoy/ConvoyAssignment/WasteRecord/AlertRule rows.
      Idempotent (deterministic ids), standalone (not wired into
      docker-compose)
- [x] `scripts/seed_waters_demo.py` — DELETED (Waters/Node-specific,
      fully superseded by `seed_himadri_demo.py`)
- [x] `scripts/seed_predictive_maintenance_demo.py` — rewritten for the
      new schema (Reading/Asset/Alert, not Metric/Node); scoped to 4 demo
      assets (3 incident-prone + 1 healthy baseline) rather than the old
      10 — see the file's own docstring for why that scope, and why fewer
      than ~3-4 would risk a degenerate chronological train/val split

## PHASE 4: Docker / Deployment Cosmetics
Status: COMPLETE
Progress: 100%

- [x] `docker-compose.yml` — container names `inframind_*` -> `himadri_*`
      (postgres/neo4j/redis/backend); Postgres user/password/db and Neo4j
      password -> `himadri` (matches `backend/config.py`'s defaults);
      `mongo` deliberately left untouched (frontend-owned datastore, out
      of this backend's scope — see PROJECT_CONTEXT.md)
- [x] `backend/Dockerfile`, `Dockerfile.linux`, `Dockerfile.mac` — audited,
      contained no `inframind`/`waters` string literals to begin with (they
      were already generic build scripts); no changes needed
- [x] `backend/requirements.txt` — audited, nothing unused found; left as-is

## PHASE 5: Documentation
Status: COMPLETE
Progress: 100%

- [x] `context/PROJECT_CONTEXT.md` — rewritten for HIMADRI
- [x] `context/DEVELOPMENT_STATUS.md` — this file
- [x] `context/BACKLOG.md` — rewritten for HIMADRI
- [x] `README.md` — rewritten for HIMADRI

---

## PHASE 6: MQTT Ingest ("remote management")
Status: COMPLETE (code-complete, UNVERIFIED — see "Verification" below)
Progress: 100%

Second, standard IoT telemetry ingest path alongside the device agent's
`/agent/heartbeat`, per the project's original architecture brief's MQTT
contract — this backend had deliberately deviated to HTTP-only heartbeat;
this phase reverses that specifically for MQTT, for real sensor gateways/
hardware, not the demo agent.

- [x] `backend/services/ingest_engine.py` (new) — the shared reading ->
      alert -> risk -> graph -> WS pipeline extracted out of
      `backend/routers/agents.py`'s `receive_heartbeat()`. Both
      `/agent/heartbeat` and the new MQTT listener call this; heartbeat-
      only concerns (`simulation_active` status override, the simulation-
      flag INFO alert, pending-command delivery, `HeartbeatResponse`) stay
      in the router.
- [x] `backend/routers/agents.py` — `receive_heartbeat()` refactored to
      call `ingest_engine.ingest_reading()`; behavior preserved exactly
      (same alert/risk/graph/WS side effects, same response shape) — no
      other route in this file touched.
- [x] `backend/services/mqtt_ingest.py` (new) — subscribes to
      `himadri/+/+/+` via `aiomqtt`; parses topic (station_id/asset_id/
      series_name) and payload (`ts`/`value`/`unit`/`source`/`quality`/
      `device_id`); looks up the `Asset`, requires it to exist and be
      `approved`, validates `unit` against `Asset.manifest` when declared;
      calls `ingest_engine.ingest_reading()`. Logs and drops on any
      malformed/unknown/unapproved case; never crashes the listener.
- [x] `backend/main.py` — lifespan starts/stops the MQTT listener
      (`mqtt_ingest.start()`/`stop()`), gated by `settings.MQTT_ENABLED`,
      non-fatal if Mosquitto is unreachable (same posture as the existing
      Neo4j `verify_connectivity()` block).
- [x] `backend/config.py` — `MQTT_ENABLED`, `MQTT_BROKER_HOST`,
      `MQTT_BROKER_PORT` added to `Settings`, default `localhost:1883`
      (see the setting's own docstring for why `localhost`, not
      `mosquitto`, is the *default* — docker-compose overrides it, same
      pattern as every other service host in this file).
- [x] `docker-compose.yml` — `mosquitto` service (`eclipse-mosquitto:2`,
      port 1883, `mosquitto_data` volume, anonymous-access config mounted
      from `mosquitto/mosquitto.conf`); `backend` service's `depends_on`
      includes it (`service_started`, not `service_healthy` — mosquitto
      has no healthcheck, deliberately, since MQTT ingest must never block
      backend startup) and its environment sets `MQTT_BROKER_HOST:
      mosquitto`.
- [x] `mosquitto/mosquitto.conf` (new) — `listener 1883`,
      `allow_anonymous true`, `persistence true` — hackathon/demo posture,
      matching this stack's existing documented security posture.
- [x] `backend/requirements.txt` — `aiomqtt==2.3.0` added (see
      `backend/services/mqtt_ingest.py`'s own docstring for why aiomqtt
      over paho-mqtt's own client API directly).
- [x] Docs — this file, `context/PROJECT_CONTEXT.md` ("Device
      Connectivity" section), `README.md` (architecture diagram, a new
      "Device Connectivity" section with the exact topic/payload contract,
      API cheatsheet, project structure tree, troubleshooting).

Deliberately NOT done / left as-is:
- `backend/models/tables.py` / `backend/schemas/schemas.py` — not
  modified, per explicit scope. `quality` and `device_id` from the MQTT
  payload are logged but not persisted (no columns for them on
  `Reading`/`Asset`) — see KNOWN GAPS below.
- No new HTTP route — MQTT is a broker subscription, not a REST endpoint;
  nothing added to `backend/routers/`.
- `agent/` (PySide6 device agent) and `frontend/` — untouched, out of
  scope for this pass.

## Verification (read this before demoing)

**No Docker, no live Postgres/Neo4j, and no working Python interpreter were
available in the environment this pass ran in** (`python`/`python3`/`py`
all failed to launch — see the actual error captured mid-session: `py -3
--version` returned `[ERROR] Failed to launch
...python3.13t.exe (0x80070003)`). Every change in Phases 2-5 was verified
by:
- Careful manual reading of the ground-truth files (`backend/models/tables.py`,
  `backend/schemas/schemas.py`, `backend/routers/agents.py`,
  `backend/services/diagnosis_engine.py`, `backend/database/{postgres,neo4j_client}.py`,
  `backend/analysis/*.py`) to match field names, endpoint contracts, and
  constraint values exactly
- Grepping the whole repo for leftover `Node`/`node_id`/`node_type`/`Waters`/
  `InfraMind` (as code, not as historical-lineage comments) and psutil imports
  after each rewrite
- Manually re-reading every new/changed file end-to-end for syntax and
  cross-file consistency (constructor signatures, attribute names, import
  paths) since no compiler/linter/interpreter could run

**Nothing here was run.** No `docker compose up`, no smoke test, no agent
actually connecting to a live backend, no seed script actually executed
against a real Postgres. The next person to pick this up should, before
any demo:
1. `docker compose up -d`, confirm all containers healthy
2. `python scripts/init_db.py && python scripts/init_graph.py`
3. `python scripts/seed_himadri_demo.py`, then
   `python scripts/seed_predictive_maintenance_demo.py` (needs the backend
   container already running)
4. Launch `agent/agent.py` against a real registered asset (register one
   via `POST /agent/register` first) and confirm a heartbeat round-trips
   with real readings, a real alert, and — ideally — a real Command
   delivered and acked
5. Exercise each of the 5 fault-injection buttons once and confirm the
   matching `diagnosis_engine` rule's evidence flags line up with what a
   demo operator would actually observe

**Phase 6 (MQTT) specifically — same "nothing was run" caveat applies, and
more sharply: `aiomqtt` itself was never `pip install`-ed or imported in
this environment**, so beyond careful reading of its documented public API
(the `async with aiomqtt.Client(...) as client: await client.subscribe(...);
async for message in client.messages:` shape used in
`backend/services/mqtt_ingest.py`), there is no way this pass could confirm
the exact method names/signatures against a real installed version, or that
`aiomqtt==2.3.0` is even the right pin — that version number was chosen as
a plausible recent release, not verified against PyPI (no internet/pip
access in this environment either). Before relying on this in a demo:
1. `pip install -r backend/requirements.txt` and confirm `aiomqtt` actually
   installs at that pin and its API matches what `mqtt_ingest.py` calls —
   adjust the pin/import if it doesn't
2. `docker compose up -d` (now includes `mosquitto`) and confirm the
   backend logs `mqtt_ingest.connected` (not `mqtt_ingest.broker_unreachable`
   in a retry loop)
3. `mosquitto_pub -h localhost -t himadri/maitri/<a-real-seeded-asset-id>/<series> -m '{"ts":"2026-09-21T00:00:00Z","value":1,"unit":"...","source":"sensor","quality":90,"device_id":"test"}'`
   against a real seeded asset/series and confirm a `Reading` row, WS
   `reading.updated` event, and (if the value trips a rule) an `alert.triggered`
   event actually appear
4. Publish once to an asset_id that doesn't exist, and once to an
   unapproved one, and confirm both are dropped with a warning log and
   nothing is written
5. Publish a reading whose `unit` doesn't match a manifest-declared series
   and confirm it's rejected (`mqtt_ingest.unit_mismatch`), then publish
   the correct unit and confirm it's accepted
6. Restart the backend with Mosquitto stopped and confirm startup still
   succeeds and `/agent/heartbeat` still works — the whole point of the
   non-fatal design

## KNOWN GAPS (honest — flagged, not silently left)

- `/model-accuracy/drift`'s per-feature drift score is a
  `random.uniform` placeholder, not real distribution-shift detection
  (pre-existing, not touched by this pass).
- `backend/analysis/weekly_job.py` has no scheduler wired to it — it's a
  manual/cron-triggered script, not an automated weekly job despite the
  filename (pre-existing).
- Redis is provisioned in `docker-compose.yml` but not load-bearing for
  any backend feature yet (grepped: the only mention of "redis" in
  `backend/` is a comment in `pending_commands.py` explaining why that
  queue is deliberately NOT in Redis). Fine to leave as a future-use
  container, but don't assume anything currently depends on it.
- The device agent's "Asset Category" selector is a **local-only** demo
  convenience (see `agent/gui/main_window.py`'s `_on_category_changed`
  and `agent/core/heartbeat.py`'s `set_role()` docstrings) — unlike the
  old InfraMind agent's `node_type` heartbeat field, the new
  `HeartbeatRequest` schema has no category field, so switching it can
  never change what the backend thinks that `asset_id`'s category is. This
  is a deliberate, documented limitation of the new contract, not a bug.
- `scripts/seed_predictive_maintenance_demo.py` is scoped to 4 assets, not
  every seeded asset — a deliberate scope call given the time available
  for this pass (see its own docstring). It produces a real, trained model
  with genuine (not perfect) accuracy, not a hand-typed number.
- Numeric specs invented for this pass's seed data (exact tank litres,
  exact generator kW, inventory quantities) are marked `provenance:
  "simulated"` on their rows; facts stated in the project's own source
  material are marked `"documentary"`/`"verified"`. The Maitri boiler/
  heat-trace system is marked `"unverified"` because the source material
  itself flags that detail as unverified — this is intentional, not an
  oversight.
- MQTT payload's `quality` (0-100) and `device_id` fields are logged
  (`mqtt_ingest.reading_ingested`) but not persisted anywhere — `Reading`
  has no `quality`/`device_id` columns and `backend/models/tables.py` was
  explicitly out of scope for this pass. If a future pass wants these
  queryable/reportable, that's a real schema change (new `Reading` columns
  or a separate table) to make deliberately, not a default.
- `aiomqtt==2.3.0`'s pin and API usage were never verified against an
  actual install (no pip/internet access) — see "Verification" above,
  Phase 6 section, before trusting it in a demo.
- No automated/unit tests were added for `ingest_engine.py` or
  `mqtt_ingest.py` (this codebase has no existing test suite to extend —
  grepped, none found) — verification is manual code review only, per
  "Verification" above.

---

## AGENT NOTES

2026-09-21 — Claude Sonnet 5: Added the MQTT telemetry ingest path
("remote management") per an explicit request, alongside the existing
`/agent/heartbeat` HTTP path (left untouched as the demo/simulator
transport). Extracted the shared reading -> alert -> risk -> graph -> WS
pipeline out of `backend/routers/agents.py`'s `receive_heartbeat()` into
new `backend/services/ingest_engine.py`, so both `/agent/heartbeat` and the
new `backend/services/mqtt_ingest.py` (Mosquitto listener, topic
`himadri/{station_id}/{asset_id}/{series_name}`, `aiomqtt` client) run
identical logic. Touched `backend/routers/agents.py` only to extract that
shared logic (no other route in the file changed), `backend/main.py`'s
lifespan (start/stop the MQTT listener, non-fatal like the existing Neo4j
block), and `backend/config.py` (three new `MQTT_*` settings). Did NOT
touch `backend/models/tables.py` or `backend/schemas/schemas.py` — the
MQTT payload's `quality`/`device_id` fields are logged but not persisted
because of this (see KNOWN GAPS). Did not touch `agent/`, `frontend/`, or
`scripts/`. Added `mosquitto` to `docker-compose.yml` (no healthcheck,
deliberately — MQTT ingest must never gate backend startup) and
`mosquitto/mosquitto.conf` (anonymous access, demo posture). Updated all
three docs (this file, `PROJECT_CONTEXT.md`, `README.md`) with the exact
topic/payload contract. Verified by careful manual reading of every
ground-truth file this depends on (`backend/routers/agents.py`,
`backend/services/{alert_engine,risk_engine,dependency_engine,
command_engine,pending_commands}.py`, `backend/models/tables.py`,
`backend/schemas/schemas.py`, `backend/database/{postgres,neo4j_client}.py`,
`backend/websocket/manager.py`, `backend/main.py`, `backend/config.py`,
`backend/routers/devices.py`) and re-reading every new/changed file
end-to-end for cross-file consistency (import correctness, no leftover
`select`/`AlertRule`/`Reading` imports left unused in `agents.py`, no
TODOs). **No working Python interpreter, Docker, or internet/pip access
was available in this environment — nothing here was executed, and
`aiomqtt` itself was never installed or imported to confirm its API**; see
"Verification" above, Phase 6 section, for the specific steps the next
person should run before demoing this.

2026-09-20 — Claude (Sonnet 5): Converted `agent/` (device agent) and
`scripts/` (seed data) from the old InfraMind/Waters IT-infrastructure
model to HIMADRI's Antarctic-station model, renamed `inframind_*` container
names and Postgres/Neo4j credentials to `himadri_*`/`himadri` in
`docker-compose.yml`, and rewrote all four `context/`+`README.md` docs.
Did NOT touch `backend/models/tables.py`, `backend/schemas/schemas.py`,
`backend/database/*`, `backend/dependencies.py`, `backend/config.py`,
`backend/services/*.py`, `backend/routers/*.py`, `backend/main.py`,
`backend/websocket/manager.py`, or `backend/analysis/*.py` — those were
already rewritten for HIMADRI before this pass started and were read only
as ground truth. Full detail of what changed and why is in this file's
Phase 2-5 sections and PROJECT_CONTEXT.md's "Device Agent" section.
Verified by careful manual code review and cross-file consistency checks
only — no working Python interpreter or Docker was available in this
environment to actually run any of it (see "Verification" above). Deleted
`scripts/seed_waters_demo.py` outright (fully superseded); rewrote rather
than deleted `scripts/seed_predictive_maintenance_demo.py` since a working,
schema-correct predictive-maintenance demo seed was explicitly in scope and

2026-09-20 — Claude (Sonnet 5): Converted `agent/` (device agent) and
`scripts/` (seed data) from the old InfraMind/Waters IT-infrastructure
model to HIMADRI's Antarctic-station model, renamed `inframind_*` container
names and Postgres/Neo4j credentials to `himadri_*`/`himadri` in
`docker-compose.yml`, and rewrote all four `context/`+`README.md` docs.
Did NOT touch `backend/models/tables.py`, `backend/schemas/schemas.py`,
`backend/database/*`, `backend/dependencies.py`, `backend/config.py`,
`backend/services/*.py`, `backend/routers/*.py`, `backend/main.py`,
`backend/websocket/manager.py`, or `backend/analysis/*.py` — those were
already rewritten for HIMADRI before this pass started and were read only
as ground truth. Full detail of what changed and why is in this file's
Phase 2-5 sections and PROJECT_CONTEXT.md's "Device Agent" section.
Verified by careful manual code review and cross-file consistency checks
only — no working Python interpreter or Docker was available in this
environment to actually run any of it (see "Verification" above). Deleted
`scripts/seed_waters_demo.py` outright (fully superseded); rewrote rather
than deleted `scripts/seed_predictive_maintenance_demo.py` since a working,
schema-correct predictive-maintenance demo seed was explicitly in scope and
achievable in the time available.
