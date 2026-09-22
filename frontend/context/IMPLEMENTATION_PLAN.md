⚠️  AI AGENT INSTRUCTIONS — READ BEFORE WRITING ANY CODE

1. Do **not** read either context file in full — both are cheap-to-read by design; blowing that up
   costs real credits every iteration. Read this plan's Ground Rules + Already-done table (below,
   short) and only the **top ~150 lines** of `InfraMind/context/CONTEXT.md` (newest-first — older
   entries live in `CONTEXT_ARCHIVE.md` and are summarized in this plan's Phase 0-10 history and
   the Already-done table; grep either context file by keyword if you need something specific from
   further back, don't read it wholesale).
2. Find the **first unchecked `- [ ]` task in the lowest incomplete phase**. Do that one task.
3. Complete it fully — no partial implementations, no TODOs, no stubs left behind.
4. Run the verification gate at the bottom of this file. A task is not done until it passes.
5. Tick the box `- [x]` and append a dated note to `CONTEXT.md` describing what you did,
   what you touched, and anything the next agent needs to know.
6. Never start a new phase while the previous phase has unchecked tasks.
7. Never duplicate a module that already exists — grep first. This codebase already has
   auth helpers, graph utils, UI primitives, and a node-type config. Reuse them.

---

# InfraMind Frontend — Phased Implementation Plan

Last Updated: 2026-08-29 (backlog refresh — see note below)
Scope: the Next.js frontend (`InfraMind/`). The FastAPI backend (`InfraMind.py/`) is
**not** modified by this program — see Ground Rules.

**2026-08-29 backlog refresh:** the user supplied an updated, expanded backlog. Diffed against
progress so far:
- Several already-`[x]` tasks turned out to be incomplete or regressed once used for real —
  their follow-up fixes are appended as **new** bullets in the phase they belong to (search
  this file for "regression" or "follow-up" to find them). Do not un-check the original box;
  the new bullet is the actual remaining work.
- Several backlog items are genuinely backend/FastAPI work, or need an always-on process this
  loop's serverless Next.js routes can't provide. Those are collected in **Backend backlog**
  near the end of this file — **do not action them from this loop.**
- A few backlog lines duplicate an existing phase almost exactly (e.g. "give option for custom
  function of each node" = Phase 8). Where that's true, no new task was added — the existing
  one already covers it.

## Ground rules for this program

- **Persistence goes in MongoDB via Next.js API routes.** Mongoose + `dbConnect()` are already
  wired ([InfraMind/src/lib/mongodb.ts](InfraMind/src/lib/mongodb.ts)). This includes mirroring
  simulation runs — decided deliberately, even though FastAPI also persists them in Postgres.
- **De-hardcode by deriving in Next.js**, not by adding Python endpoints. Compute from the real
  graph topology plus the real `POST /simulation/run` blast radius.
- **Do not add Python/FastAPI endpoints.** The frontend currently calls several routes that do
  not exist and 404 (`/remediation/*`, `/simulation/vectors`, `/simulation/runs/{id}/impact`,
  `/model/*`, `/business-process/*`). Replace those calls with Next.js routes; don't build
  the Python side.
- **FastAPI must never learn about users, roles, or departments.** That boundary is documented
  in CONTEXT.md and still holds.
- **Auth is done.** Use `getCurrentMembership` / `requireActiveMembership` / `requireRole` /
  `requirePermission` from [InfraMind/src/lib/auth/rbac.ts](InfraMind/src/lib/auth/rbac.ts).
  Do not write new auth code.

## What the real FastAPI backend actually exposes

Anything not on this list does not exist. Verified against `InfraMind.py/backend/routers/`:

```
/agent/register  /agent/whoami  /agent/heartbeat
/nodes  /nodes/{id}  /nodes/{id}/credentials  /nodes/{id}/metrics
/nodes/{id}/dependencies  /nodes/{id}/blast-radius  /nodes/{id}/alerts
/fleet/summary  /fleet/graph
/simulation/run  /simulation/{id}  /simulation/history/{node_id}
/reports  /reports/{id}  /reports/generate
WS /ws        MCP /mcp
```

## Already done (do NOT redo — refine only if a task below says so)

| Backlog item | Where |
|---|---|
| Connect node → ID/API key → agent | `ConnectNodeModal.tsx`, backend `/agent/whoami` |
| Network Storm / Node Failure capture | `InfraMind.py/agent/core/{simulator,heartbeat}.py` |
| RBAC + auth via Next.js + MongoDB | `lib/auth/*`, `lib/models/*`, `/admin/team` |
| Team view/manage page + email invites | `/admin/team`, `/api/admin/*` |
| Login / signup | Clerk, `(auth)/sign-in`, `(auth)/sign-up` |
| Landing page | `src/app/page.tsx` (revisit in Phase 9 only) |
| Unique node-type icons | `lib/graph/nodeTypes.ts`, `components/graph/GraphNode.tsx` |
| Digital twin as centerpiece | `app/digital-twin/page.tsx` (customization = Phase 7) |
| Type-specific node panels | `components/graph/panels/*` (per-node *work* = Phase 8) |

---

## Phases 0-10 — DONE (compressed history)

All tasks in Phases 0-10 are complete and verified. Full task-by-task detail (file-by-file, with
the reasoning behind each) lives in `CONTEXT_ARCHIVE.md` — grep it by phase/task name if you need
the original rationale for something below; don't read it wholesale. One-line-per-phase summary,
kept only so a future phase doesn't duplicate what already exists:

- [x] **Phase 0 — Persistence foundation.** Mongo models (`Architecture`, `SimulationRun`,
      `ShadowRun`, `ActivityLog`, `NodeBusinessMeta`) in `src/lib/models/`; `logActivity()` in
      `src/lib/logging/activity.ts`; BFS blast-radius helper in `src/lib/graph/blastRadius.ts`;
      `GET /api/team/members`.
- [x] **Phase 1 — P1 bug sweep.** Critical-vs-At-Risk classification fixed in `digital-twin/page.tsx`
      + `backendAdapters.ts`'s `classifyHealth()`; `isSimulating` flag added to `GraphNode`;
      `/api/remediation/{recommendations,execute,runbook}` built (real FastAPI routes 404);
      Scenario Builder auto-arrange wired; `NodeInspector` opens as a centered modal, not a side
      drawer, with a persistent ~4-5s post-Remediate banner.
- [x] **Phase 2 — Save / Load / Share architectures.** `/api/architectures[/[id]][/share]`;
      Scenario Builder Save/Save As/Load/Share; `/simulation/architectures` library page
      (mine/shared/department tabs); save payload includes edges + node x/y layout; node deletion
      wired in Scenario Builder.
- [x] **Phase 3 — Real simulation results.** `POST /api/simulation/analyze` (blast radius +
      FastAPI `/simulation/run` when live) persisting `SimulationRun`; `results/page.tsx` wired to
      it; node business-metadata editor (revenue/hour, SLA tier).
- [x] **Phase 4 — Shadow Run real + Scenario sync.** `shadowRun.service.ts` built for real
      (was all-zero stub); Shadow side loads a saved Architecture incl. layout; every run persisted
      as `ShadowRun` with an architecture-scoped history tab; continuous background Shadow Run done
      via `Architecture.continuousShadowRun` + `GET /api/cron/shadow-run` (Vercel cron).
- [x] **Phase 5 — Replay + Logs page.** `replay.service.ts` reads real `SimulationRun`/`ShadowRun`/
      `Architecture` docs (was 4 hardcoded rows); ghost-state viewer + `logOutcome` persistence;
      `/logs` page over `ActivityLog` (general feed + Audit Log filter preset); per-architecture
      log-stream tab.
- [x] **Phase 6 — CAB Copilot + LLM fallback.** `src/lib/llm/provider.ts` (Gemini primary, OpenAI
      fallback); `/api/cab/{report,chat}` grounded in real sim result + business metadata (replaced
      `cab.service.ts`'s canned paragraph); revenue-exposure chart; `ChatSession`/`ChatMessage`
      Mongo persistence shared with Phase 7's chat.
- [x] **Phase 7 — Digital twin customization + MCP chat.** View controls (layout/color-mode/
      edge-labels/legend/fullscreen, persisted per user); location-hierarchy filter dropdowns;
      floating chat panel + `POST /api/chat/mcp` (LLM-direct today; n8n webhook swap-in stays
      blocked on `N8N_WEBHOOK_URL`).
- [x] **Phase 8 — Per-node-type custom work.** `nodeTypes.ts` `actions[]` config; `NodeWorkProfile`
      Mongo model; domain node types + actions rendered in `components/graph/panels/*`, executing
      writes an `ActivityLog`.
- [x] **Phase 9 — Site flow + RBAC scoping gap.** landing→sign-in→waiting-approval→digital-twin
      flow with role-aware nav; graph/node fetches proxied through Next.js server routes with
      `getCurrentMembership()` department scoping (was browser→FastAPI direct, unscoped); pending
      team-request Reject/Revoke action.
- [x] **Phase 10 — Type-aware risk scoring.** `lib/graph/riskWeighting.ts` (per-`NodeType` weighting,
      display-layer only); weighted score surfaced on node-health, at-risk lists, Phase 8 panels.

## Phase 11 — 2026-09-04 backlog addition

New user-supplied backlog. All are frontend-feasible; none require touching `InfraMind.py`.

- [x] **Select multiple nodes, or a single node, as a simulation target.** Today a run targets one
      node — `targetNodeId` is singular on `SimulationRun.ts`, `/api/simulation/analyze/route.ts`,
      and the click-to-select in [scenario-builder/page.tsx](InfraMind/src/app/simulation/scenario-builder/page.tsx).
      Add multi-select (click + ctrl/shift-click or a selection-mode toggle) on the graph canvas,
      and let a run accept an array of target node ids. `blastRadius.ts`'s BFS already takes a
      single start node — union the impacted sets across all selected targets (dedupe by node id,
      keep the minimum depth per node) rather than running N independent unrelated simulations.
      Keep single-node runs working exactly as before when only one node is selected.
- [x] **Reports must explicitly weigh legacy systems, not just generic "compatibility."** The
      2026-09-04 CONTEXT entries added a compatibility/EOL risk category to `build-with-ai/route.ts`
      and `cab/report/route.ts`'s system prompts, but there is no actual "legacy" signal on a node
      to ground that in — it's the LLM guessing from the node label/type alone. Check what age/
      EOL/lifecycle metadata (if any) exists on `GraphNode`/`NodeBusinessMeta`/the node-type config;
      if none does, add a simple field (e.g. `deployedAt` or an explicit `legacy: boolean` /
      lifecycle-stage on `NodeBusinessMeta`) and thread it into both prompts' context so a report
      can name *which* nodes are legacy and why, instead of a generic hedge.
- [x] **A worked example of a Shadow Run.** New users land on
      [shadow-run/page.tsx](InfraMind/src/app/simulation/shadow-run/page.tsx) with nothing to look
      at until they run one live. Add a seeded/example `ShadowRun` (clearly labeled as an example,
      not live data) reachable via a "View example" action, showing realistic divergence across
      live vs. simulated health/latency/blast-radius, so the feature is demonstrable without first
      wiring up a real comparison run.
- [ ] **Replay system.** Audit [replay/page.tsx](InfraMind/src/app/simulation/replay/page.tsx) and
      `replay.service.ts` against what "replay" implies: confirm whether a user can actually step
      through a recorded run's snapshots over time (a scrub/playback control), or whether it only
      lists/opens static historical rows today. If there's no real playback, add a timeline
      scrubber over the stored `SimulationRun`/`ShadowRun` snapshots for a selected event so the
      ghost-state viewer advances through the recorded sequence instead of showing one fixed state.
- [ ] **No auto-approve in CAB Co-Pilot.** Audit every path that can set a `CabChecklistItem` or a
      scenario's review status to `'approved'` — `handleReview`/`handleScenarioReviewAction` in
      [cab-copilot/page.tsx](InfraMind/src/app/simulation/cab-copilot/page.tsx), the checklist
      creation default in `/api/cab/checklist/route.ts` (should stay `'pending'`), and
      `types/simulation.ts`'s `status: 'approved'` value — and confirm none of them is ever set
      programmatically without an explicit human click on Approve. If one is found, remove the
      auto-transition and require the explicit review action every time.
- [ ] **Risk score must never render as 0 anywhere a change/scenario is being assessed.** The
      2026-09-04 CONTEXT entries fixed this for `cab/report/route.ts`'s `riskScore` (now LLM-assessed,
      `min(1)`) and `build-with-ai/route.ts`'s `risks` list (now `min(2)`). Audit the remaining
      surfaces that show a risk figure for a change/simulation — `simulation/analyze/route.ts`'s
      `riskScore`, Phase 10's type-weighted risk, and anywhere Predictive Maintenance surfaces a
      risk/probability — and ensure each has a real floor so a change is never presented as
      zero-risk. (A genuinely idle/healthy node's own baseline health score legitimately reading
      as low is a different thing and out of scope here — this is specifically about risk *of a
      change or simulated event*.)
- [ ] **More visibility into effects on other nodes in Predictive Maintenance.**
      [model-accuracy/page.tsx](InfraMind/src/app/digital-twin/model-accuracy/page.tsx) (the PdM
      view) shows accuracy/drift/forecast for the model and its target node only — no indication of
      what else in the fleet would be affected if a predicted failure/degradation actually
      happens. Reuse `lib/graph/blastRadius.ts` against the node(s) PdM is predicting risk for and
      surface that impacted-node list (and ideally the same 1-hop-affected treatment used elsewhere
      per the 2026-09-04 CONTEXT entry) directly on the PdM page.

---

## Backend backlog (reference only — NOT part of this frontend loop)

These items genuinely require touching `InfraMind.py` (FastAPI/Neo4j/Postgres/agent), need an
always-on process a serverless Next.js route can't provide, or are a separate ML initiative.
**The Ralph loop driving this file must never act on these** — `.ralph/PROMPT.md` scopes it to
the Next.js frontend only, and `InfraMind.py` is a separate git repo with its own
`context/DEVELOPMENT_STATUS.md` and its own review process. This section exists so nothing from
the 2026-08-29 backlog gets silently lost, not to queue up automated work against it. A mirror of
this list also lives at `InfraMind.py/context/BACKLOG.md` for whoever works that repo next.

- **Heartbeat/offline-detection timeout: 60s → 10s.** A single constant in the FastAPI
  background task that marks a node unreachable after a missed-heartbeat window (see
  `InfraMind.py/context/DEVELOPMENT_STATUS.md`'s 2026-08-23 agent note for where this lives).
  Low-risk, single-line change — reasonable to do by hand or in a short dedicated backend session
  rather than folding into this frontend program.
- **Backend-side persistence of nodes+edges** for both live topology and simulation-lab
  architectures (Neo4j/Postgres), as an alternative or complement to the Mongo `Architecture`
  model this program already built. A real architectural decision — does saved-architecture data
  belong in the frontend's Mongo (current approach, already shipped in Phase 2) or should FastAPI
  own it too? Don't duplicate silently; if this comes up, it needs a human decision first.
- **Separate backend-side log streams for the Architecture and Replay systems** (as distinct from
  the frontend's `ActivityLog`-backed `/logs` page in Phase 5, which already covers the
  Next.js-reachable version of this ask).
- ~~**ML system for Predictive Maintenance.**~~ — **done 2026-08-30**, outside the Ralph loop, in
  `InfraMind.py`: `backend/analysis/{data_loader,feature_engineering,train,predict,weekly_job}.py`
  + `backend/routers/predictive_maintenance.py` (RandomForest classifier + regressor trained on
  real Metric/Alert history). This is what the Digital Twin nav's "Predictive Maintenance" item
  (still routed at `/digital-twin/model-accuracy` and calling `modelAccuracy.service.ts`'s
  `/model-accuracy/*` endpoints — kept on that URL/prefix on purpose, no frontend change needed)
  now serves for real instead of a stub. See `InfraMind.py/context/DEVELOPMENT_STATUS.md`'s
  PHASE 6 and `InfraMind.py/context/BACKLOG.md`.
- ~~**Shadow Run running continuously in the background**~~ — **done 2026-08-30**, outside the
  Ralph loop, via a Vercel/host cron hitting `GET /api/cron/shadow-run` (no FastAPI/InfraMind.py
  changes needed — the always-on piece is the cron scheduler, not a new backend process). See
  Phase 4's second checkbox and `context/CONTEXT.md`'s 2026-08-30 entry.
- **CAB Copilot backend depth.** Phase 6 covers the achievable Next.js-side fix (real simulation
  result + business metadata replacing the canned paragraph). If the ask is for CAB to reason
  over live backend load/capacity data beyond what `/fleet/summary` and `/simulation/run` already
  expose, that's new backend surface, not a frontend gap.
- **Risk-engine-level type-aware scoring** (`InfraMind.py/backend/services/risk_engine.py`
  actually weighting risk differently per node type, as opposed to Phase 10's frontend-side
  derived/display weighting over the existing raw score).

## Verification gate

A task is not complete until this passes:

```bash
cd InfraMind && npx tsc --noEmit && npx next build && npx eslint <changed files>
```

**Known pre-existing noise — do NOT treat as regressions caused by your change:**
- `next build` warns the `middleware` file convention is deprecated in favour of `proxy`.
- Several pages trip `react-hooks/set-state-in-effect` (Navbar, node-health, model-accuracy,
  digital-twin, NodeInspector). This pattern predates this program.

Report honestly. If something fails or you skipped part of a task, say so in CONTEXT.md and
leave the box unchecked rather than ticking it optimistically.
