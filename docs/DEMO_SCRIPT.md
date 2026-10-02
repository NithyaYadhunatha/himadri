# Himadri — 4-minute demo script

Goal: one clear thesis, then **prove it live**. Every other team shows a tour of tabs; we show four things nobody else can.

> **Thesis (say this first, one breath):** *"Every other twin is a dashboard. Himadri is the one you can trust to act — even when the link is gone — and it proves every number."*

## Before you hit record

1. Start the station feeder (keeps all 63 assets alive and acts on remote commands):
   `node tools/station-feeder/feeder.mjs --interval 15`
2. Frontend: `cd frontend && npm run dev -- --webpack` (or `npm run build && npm start`), signed in as an HQ operator.
3. Press **Shift + D** once to confirm the Demo Director sees the feeder, then close it.
4. Open `/mission` full screen at 1440 × 900. Have the physical rig powered if you are showing hardware.

## 0:00 – 0:30 · The problem, with numbers

Landing page. Say: *two stations, eleven thousand kilometres, a satellite link that drops for days, fuel that cannot be replaced, a dozen people.* Click **Enter mission control**.

## 0:30 – 1:00 · One picture, correlated

`/mission`. Point at the **Situation board**: weather × convoy × fuel × power in one sentence. *"The convoy is NO-GO because the ambulance isn't assigned; gusts to 94 km/h are forecast; fuel covers isolation with 21 days to spare."* That sentence is computed live from four different domains — nobody else correlates them.

## 1:00 – 2:15 · Proof demo (the part that wins)

1. **Survive the outage.** `/resilience` → **Cut link (blizzard)**. Station keeps running; queue builds; click **+ Critical alert** and show it lands in P0. **Restore** → alerts drain first, bulk last, bytes saved. *"Everything on this page's lower half is the policy the backend's sync queue runs."*
2. **A real incident.** Shift + D → **Generator fault**. Within ~30 s: critical alert on `/alerts`, risk rises on `/mission`, status bar turns. Click **Locate** → the asset on the 2D twin; open blast radius. Clear the incident.
3. **Never alone.** `/remote-control` → ambulance → **Start** → it sits at *waiting for a second person* with the 15-minute countdown. Try to approve as the same person → refused. Approve as a different name → *queued → co-approved → sent → acked → applied* walks across in ~15 s, and the **Trust Center** ledger shows the events chained.

## 2:15 – 2:45 · The safety interlock

`/logistics` → **Try to depart anyway**. The backend refuses and its own message appears: *"no ambulance escort"*. *"The rule isn't a greyed-out button — the API enforces it."*

## 2:45 – 3:20 · Proof of trust

`/trust` → **Re-verify now** (chain intact, N events re-hashed). Show provenance badges (verified / documentary / simulated). Show the RBAC matrix. *"Figures we invented are labelled simulated; nothing is passed off as measured."*

## 3:20 – 3:50 · Under the hood

`/architecture`: the five-stage pipeline with live counters, then the hardware panel (Arduino + Pi → gateway → backend → Unity twin; commands flow back). If the rig is on, flip the buzzer from the twin.

## 3:50 – 4:00 · Close

Open **Ask Himadri**, ask *"How long will our fuel last?"* — it answers from live data and names the source, with no external model needed. End on `/report` → *Print / Save as PDF*: *"a one-page briefing that works over a thin link."*

## If a judge asks…

| Question | Answer |
|----------|--------|
| *Is the ML real?* | Show `/ml`: random-forest + time-to-failure registry, honest "not validated yet" when there are no recorded failures, explainable risk factors, forecasts with intervals. |
| *Does it really work offline?* | Station node runs ingest, alerts, twin, approvals and the ledger locally; the uplink is a priority store-and-forward courier (`/resilience`). |
| *How does it scale to Maitri-II?* | Stations, zones and assets are data and manifests, not code. |
| *How is two-person approval enforced?* | Backend state machine; the approver identity comes from the signed-in session outside local dev; the issuer can never approve. |
| *Why is the data "simulated"?* | Live NCPOR telemetry is restricted; the feeder emulates station agents through the real ingest pipeline, and every simulated figure is labelled. |
