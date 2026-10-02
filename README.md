# HIMADRI — PolarTwin

**Digital twin and remote-management platform for India's Antarctic research stations, Maitri and Bharati.**

Real-time asset health, guided fault diagnosis, what-if scenario simulation, logistics endurance forecasting and audited two-phase remote actuation. Built for **PS 26060 (ISRO / NCPOR)**, Smart India Hackathon 2026.

---

## Overview

| Component | Path | Stack | Purpose |
|-----------|------|-------|---------|
| Backend | [`backend/`](backend/README.md) | FastAPI, PostgreSQL, Neo4j, Redis, MQTT | REST/WebSocket API, ingest pipeline, alert/risk/diagnosis engines, dependency graph |
| Device agent | [`backend/agent/`](backend/README.md) | Python, PySide6 | Simulated station device that reports synthetic readings and injects faults |
| Frontend | [`frontend/`](frontend) | Next.js, React, Three.js, Clerk, Tailwind | Dashboard, 3D twin (Unity WebGL), RBAC, simulation, logistics, audit |
| Hardware gateway | [`PolarTwinDualBoard/`](PolarTwinDualBoard/server/README.md) | Arduino Uno, Raspberry Pi, Python | Physical sensor rig feeding live telemetry to the backend |

## Architecture

```text
 Sensors ─► Arduino Uno ─► Raspberry Pi gateway ─┐
                                                 │ HTTPS / MQTT
 Device agent (simulator) ───────────────────────┤
                                                 ▼
                    FastAPI ── PostgreSQL (state, readings, alerts, audit)
                       │   └── Neo4j (asset dependency graph, blast radius)
                       ▼
                REST + WebSocket ─► Next.js frontend ─► 3D digital twin
```

Authentication and RBAC live in the frontend (Clerk + MongoDB); the backend is user-agnostic.

## Getting Started

### Prerequisites
- Docker and Docker Compose
- Python 3.12
- Node.js 20+

### Backend
```bash
cd backend
cp .env.example .env
docker compose up -d                          # Postgres, Neo4j, Redis, Mosquitto, API
python scripts/seed_himadri_demo.py           # optional: rich demo topology
```
API: <http://localhost:8000> · Docs: <http://localhost:8000/docs>

### Frontend
```bash
cd frontend
cp .env.example .env.local                    # fill in Clerk, MongoDB and API values
npm install
npm run dev
```
App: <http://localhost:3000>

### Device agent (optional)
```bash
cd backend/agent
pip install -r requirements.txt
python agent.py
```

### Hardware gateway (optional)
See [`PolarTwinDualBoard/server/README.md`](PolarTwinDualBoard/server/README.md), [`docs/wiring.md`](PolarTwinDualBoard/docs/wiring.md) and [`docs/architecture.md`](PolarTwinDualBoard/docs/architecture.md).

## Running the demo

The deployed backend is the demo target. Its stations only look alive while something is reporting, so run the **station feeder** — a stand-in for the station device agents that posts physically plausible heartbeats for all 63 assets through the real ingest pipeline (rules → risk → graph → WebSocket):

```bash
node tools/station-feeder/feeder.mjs --interval 30        # steady state
node tools/station-feeder/feeder.mjs --fast               # demo cadence (8 s)
node tools/station-feeder/feeder.mjs --backfill           # first run: also write 24 h of history for key series
node tools/station-feeder/feeder.mjs --resupply 15000     # a ship call: +15 000 L in every day tank
```

While it runs, write an incident name into `tools/station-feeder/incident.txt` to trigger a real alert, and empty the file to clear it: `freezer_warming`, `generator_fault`, `fuel_leak`, `coolant_overheat`. The feeder also acts on remote commands (stop / start / setpoint) and reports them applied, so the full *queued → co-approved → sent → acked → applied* loop is demonstrable.

> Without a feeder (or real devices) assets are marked offline after the backend’s offline timeout and every one raises a *data continuity lost* alert. That is the system working as designed.

### Frontend pages

| Page | What it shows |
|------|---------------|
| `/mission` | Mission control: live KPIs, cross-domain situation board (weather × convoy × fuel × power), risk, alerts, engine-room counters |
| `/resilience` | Real sync-node status plus an interactive store-and-forward link simulator (cut the link, watch the priority lanes) |
| `/trust` | Audit-chain verdict (re-verify on demand), ledger explorer, provenance breakdown, two-person command pipeline |
| `/ml` | Model registry honesty (incl. “not validated yet”), forecasts with intervals, explainable risk factors |
| `/architecture` | The real pipeline with live counters per stage + the Arduino/Pi hardware loop |
| `/environment` | Live Open-Meteo conditions, 7-day storm watch, derived operational advice |
| `/energy`, `/logistics` | Fuel endurance fitted from live tank sensors; convoy go/no-go gate enforced by the backend |
| `/remote-control` | Supervised commands; life-safety assets require a different second approver |

Design system: “Paper & Ink” — warm paper surfaces, ink text, ultramarine accent, marigold highlight, Fraunces display type; tokens in `frontend/src/app/globals.css`, building blocks in `frontend/src/components/ui/kit.tsx`.

### Dev server note

Turbopack (`next dev`) can crash on Windows under bursts of requests; `npm run dev -- --webpack` is stable.

## Repository Structure

```text
himadri/
├── backend/               FastAPI service, device agent, seed scripts, Docker setup
│   ├── backend/           routers, services, models, schemas, analysis (ML)
│   ├── agent/             PySide6 station device agent
│   └── scripts/           DB/graph init and demo seeding
├── frontend/              Next.js application
│   ├── src/               app routes, components, services, store
│   └── public/            static assets and Unity WebGL build
├── PolarTwinDualBoard/    Arduino firmware, Pi gateway, wiring docs
├── tools/station-feeder/  Station simulator for the deployed backend (heartbeats, incidents, command loop)
└── postman/               API collections
```

## Configuration

Copy the `.env.example` file in `backend/` and `frontend/` and fill in the values. Never commit `.env` files or secrets.

## Documentation

- Backend details, API cheatsheet, MQTT contract, troubleshooting: [`backend/README.md`](backend/README.md)
- Hardware gateway: [`PolarTwinDualBoard/server/README.md`](PolarTwinDualBoard/server/README.md)
- Arduino firmware: [`PolarTwinDualBoard/arduino_uno/README.md`](PolarTwinDualBoard/arduino_uno/README.md)

## License

Developed for Smart India Hackathon 2026. Add a license before public distribution.
