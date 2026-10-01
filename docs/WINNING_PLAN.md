# Himadri — where we stand and what is left

Branch: `ui/lightmode-overhaul` (local commits only — **nothing has been pushed**).

## What changed in this pass

**Design system — "Paper & Ink" (light).** Warm paper surfaces, ink text, ultramarine as the single interactive accent, marigold highlight, Fraunces display type, tabular numerals. Deliberately not the icy-blue polar look every other team used. Tokens live in `frontend/src/app/globals.css`; reusable blocks (Panel, Kpi, Pill, Meter, Provenance, Tile…) in `frontend/src/components/ui/kit.tsx`. A global rule lifts the legacy tiny-mono page titles into the display face, so older pages share the voice.

**New pages (all on live deployed-backend data):**

| Route | Why it exists (the gap it closes) |
|-------|-----------------------------------|
| `/mission` | Live KPIs + **situation board** that correlates weather × convoy × fuel × power in one sentence (no other team correlates domains) + risk, alerts, "backend at work" counters |
| `/resilience` | Real sync-node status + interactive **store-and-forward link simulator** — makes the "survives offline" claim visible and demonstrable |
| `/trust` | Audit-chain verdict with on-demand re-verify, ledger explorer, provenance breakdown, **RBAC matrix**, the two-person command pipeline |
| `/ml` | Honest model registry (flags a degenerate model), forecasts with intervals (robust trend vs daily cycle), explainable risk factors |
| `/architecture` | Real pipeline with live counters per stage + the Arduino/Pi hardware loop |
| `/environment` | Real Open-Meteo conditions + 7-day **storm watch** + derived operational advice |
| `/replay` | Rewind the last day with alerts marked (Threadpool/Polarix have replay) |
| `/report` | One-page print-ready situation report |

**Rewritten on live backend shapes:** alerts (Locate-on-twin deep link, blast radius), energy (fuel endurance **derived from tank sensors**, what-if load slider), logistics (convoy go/no-go gate, backend refusal relayed), risk (true factor × subsystem heatmap), remote control (visual command lifecycle, countdown, same-user refusal), landing (live evidence strip, polar map).

**Platform extras:** persistent status bar (uplink, sync budget, audit chain, assets reporting, open alerts); "Ask Himadri" copilot that **works with no LLM** (deterministic answers from live data, source named); **Demo Director** (Shift + D) to trigger real incidents; 2D twin category clustering (it used to collapse into one column); floor-plan fallback by system.

**Station feeder** (`tools/station-feeder`): emulates the station's device agents through the real `/agent/heartbeat` pipeline — all 63 assets alive, incidents on demand, **acts on remote commands** so the queued → co-approved → sent → acked → applied loop completes.

**Backend fixes (in the repo, not deployed, never run — no Python available in this environment):**
- `series/{key}/readings` no longer 500s on a timezone-aware `from`/`to`.
- Two-person check is case/whitespace-insensitive (`aditya singh` ≠ `Aditya  Singh` loophole closed) + `backend/tests/test_command_rules.py`.
- `link_monitor` keeps `LINK_STATE` honest (standalone / up / degraded / down).
- `/model-accuracy/drift` no longer returns `random.uniform` numbers.
- Frontend approve proxy takes the approver from the signed-in session outside local dev.

## What you must do (cannot be done from here)

1. **Deploy the backend changes** and run `python -m unittest tests.test_command_rules` + a smoke test (`DEVELOPMENT_STATUS.md` still says "nothing was run").
2. **Seed the deployed database**: `python backend/scripts/seed_himadri_demo.py` — inventory, zones and most convoy data are missing there (food endurance shows "no stock data"; floor plan falls back to by-system).
3. **Keep the feeder running during demos** (or real devices). Without data every asset is marked offline after the timeout and 40+ "data continuity lost" alerts fire — correct behaviour, terrible screenshot.
4. **Security hygiene:** change `API_SECRET_KEY` (default `changeme_for_hackathon`), set `DIGITAL_TWIN_INGEST_KEY`, rotate the Clerk secret that sits in `frontend/.env.local`, turn `NEXT_PUBLIC_DEV_BYPASS_AUTH` off for the real recording and demo two real logins for the two-person rule. `.env.local` currently has `NEXT_PUBLIC_USE_MOCK=false` (was `true`).
5. **Real offline sync:** `SyncItem` is keyed by the audit sequence, so only audit events are enqueued. Telemetry/alerts need their own sequence (a schema change) before "alerts first" is true end to end. The simulator on `/resilience` shows the policy; the backend currently implements the queue + budget + priority ordering for audit events only.
6. **ML honesty:** labels come from "any critical alert within 24 h", which labels every earlier healthy reading positive and the fault itself negative. Redesign the labels (e.g. positive only in the 30–60 min *before* an alert, exclude the alert interval) and train on a documented dataset before claiming prediction quality. Until then the UI says "trained · unvalidated".
7. **Originality:** the repo's context docs and a few comments still describe the InfraMind product this codebase was converted from. Be ready to say exactly what was reused (check SIH rules), or archive those files.
8. The audit ledger now contains ~340 `reading.manual` events from the feeder's 24 h backfill (labelled `station-feeder (backfill)`); the Trust Center filters them out by default.

## Known rough edges

- Turbopack `next dev` crashes on Windows under request bursts → use `npm run dev -- --webpack` (documented in the README).
- Assets / remote-control pages make one request per asset (cached); a bulk endpoint would be better.
- The old "Failure Forecast" page (`/predictive`) is kept but empty until a model has real data; `/ml` is the demo page.
- Hardware panel shows "idle" when the Arduino/Pi rig is off — power it for the recording.
