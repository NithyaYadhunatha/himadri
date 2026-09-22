# InfraMind Context — Archive

Older entries moved out of `CONTEXT.md` on 2026-09-04 to keep the live file cheap to read every
Ralph iteration. Newest-first, same as the live file. These cover Phases 0-10's original
implementation (2026-08-22 through 2026-08-30) — all of that work is done and summarized in
`IMPLEMENTATION_PLAN.md`'s "Already done" table; only dig in here if you need the specific
reasoning/root-cause behind one of those older changes.

---

**2026-09-03 — Merged `seeeeee` (Add Edge / Remove Edge UI) into `noble2`; fixed what it broke (Claude)**
- User merged branch `seeeeee` (commit `17c5b15` "noble's issue") into their local `noble2` branch
  (`git log` shows `noble2`'s HEAD is already the merge commit, working tree clean — the merge itself
  was done before I was asked to check it) and asked me to check the changes, merge if necessary, and
  fix any issues. `git log noble2..origin/seeeeee` was empty — nothing left to merge, so this was a
  verify-and-fix pass, not a merge itself.
- What `seeeeee` added: an "Add Edge"/"Remove Edge" UI for the live Digital Twin graph —
  `components/graph/AddEdgeModal.tsx` (new), `components/graph/EdgeActionBar.tsx` (new), wired into
  `digital-twin/page.tsx`, plus `api/nodes/[id]/edges/route.ts` and
  `api/nodes/[id]/edges/[targetId]/route.ts` (new Next.js proxy routes to a FastAPI backend
  `POST`/`DELETE /nodes/{id}/edges`), and unrelated node-work-profile/business-meta route tweaks +
  `NodeInspector.tsx`/`FlowCanvas.tsx` changes.
- Ran the full verification gate (`tsc --noEmit`, `next build`, `eslint` — first repo-wide to catch
  anything from the merge, matching only files the merge touched against issues already present
  pre-merge via `git show <old-commit>:<path>` so I wasn't flagging pre-existing noise as new bugs)
  and found four real problems, all fixed:
  - **`api/nodes/[id]/edges/route.ts`** — `let body: any` → `unknown` (new file, `no-explicit-any`).
  - **`simulation/scenario-builder/page.tsx`** — `handleSimulate`'s `useCallback` read `simulationType`
    without listing it as a dependency (a merge-introduced field), a stale-closure bug: changing the
    simulation-type dropdown wouldn't actually change what the next "Run Simulation" click sent. Added
    it to the deps array.
  - **`digital-twin/page.tsx`** — new `catch (e) {}` with an unused binding → `catch {}`.
  - **`components/graph/NodeInspector.tsx`** — the merge replaced the old `{loading && <Skeleton/>}` /
    `{!loading && !error && node && (...)}` gating with base content rendering unconditionally off the
    already-available `node` prop (a real UX improvement — no more full-panel skeleton flash for data
    that's already there) but left the `loading` state and its `setLoading` calls with nothing left
    reading them, plus a now-unused `Skeleton` import. Removed all three as dead code rather than
    reintroducing the skeleton gating the new design intentionally moved away from.
- **The bigger issue was on the other side of the wire, not in this repo**: the two new proxy routes
  call `POST /nodes/{id}/edges` / `DELETE /nodes/{id}/edges/{targetId}` on the FastAPI backend, and
  that backend (`InfraMind.py`) had no such routes at all — `grep` over `backend/routers/nodes.py`
  confirmed it. The whole Add Edge/Remove Edge feature would 404 every time. Added the missing routes
  (`POST`/`DELETE /nodes/{node_id}/edges...`), a Cypher-injection guard for the frontend's free-text
  custom relationship-type field, and a `remove_relationship` graph method — full detail in
  `InfraMind.py/context/DEVELOPMENT_STATUS.md`'s 2026-09-03 entry. Verified via `py_compile` + AST
  parse + constructing the real FastAPI app + an ASGI `httpx` client hitting both routes (401 without
  auth, executes past auth with it) — no live Postgres/Neo4j available to verify a full round-trip
  end-to-end in this environment, so do that against docker-compose before calling it fully proven.
- Did not touch `node-work-profile`/`business-meta` route changes or `FlowCanvas.tsx` beyond what's
  listed above — read through them, found nothing broken.

**2026-08-30 — Predictive Maintenance backend landed; Model Accuracy tab is no longer a stub (Claude)**
- Context-only entry — no frontend code changed. The user had the Predictive Maintenance ML
  pipeline written directly in `InfraMind.py` (`backend/analysis/{data_loader,feature_engineering,
  train,predict,weekly_job}.py` + `backend/routers/predictive_maintenance.py` +
  `MLModelVersion`/`MLPrediction`/`MLPredictionOutcome` Postgres tables — RandomForest classifier
  for 24h failure probability + regressor for time-to-failure, trained from real Metric/Alert
  history) and asked for both repos' context files to catch up to reflect it.
- What this means for this repo: nothing needed to change. The Digital Twin nav item was already
  labeled "Predictive Maintenance" ([lib/constants.ts](InfraMind/src/lib/constants.ts),
  [Navbar.tsx](InfraMind/src/components/layout/Navbar.tsx)) and its page
  ([digital-twin/model-accuracy/page.tsx](InfraMind/src/app/digital-twin/model-accuracy/page.tsx))
  and service ([modelAccuracy.service.ts](InfraMind/src/services/modelAccuracy.service.ts)) were
  already calling the real backend's `/model-accuracy/*` prefix — kept on that URL/route/file path
  on purpose (see the backend router's own docstring) specifically so this frontend didn't need a
  rename. With `NEXT_PUBLIC_USE_MOCK=false` this page was already end-to-end real, not mock —
  confirmed by reading `modelAccuracy.service.ts` (every call branches on `USE_MOCK` and otherwise
  hits `${BASE}/accuracy|forecast|predictions|drift` / `POST ${BASE}/retrain` via `lib/axios.ts`)
  before writing this down, per the "verify before recommending from memory" rule.
- Updated `IMPLEMENTATION_PLAN.md`'s Backend backlog: struck the "ML system for Predictive
  Maintenance" line as done (mirrors the done-marker style already used there for Shadow Run).
- Full detail (files, tables, routes, the one real gap — no scheduler wired to `weekly_job.py`,
  and `/drift`'s per-feature drift score is currently a random placeholder, not real distribution
  shift) lives in `InfraMind.py/context/DEVELOPMENT_STATUS.md`'s new PHASE 6 and
  `InfraMind.py/context/PROJECT_CONTEXT.md`'s "Predictive Maintenance (ML)" section — read those
  before doing further work in this area rather than duplicating the description here.

**2026-08-29 — Phase 3 task 1: `POST /api/simulation/analyze` (Codex)**
- Task: first unchecked code-implementation item in the lowest incomplete phase after the Phase 1
  manual/runtime-only items remained intentionally skipped per the program rules. This fit in a
  single iteration: the persistence model (`SimulationRun`), graph helper (`computeBlastRadius`),
  auth helpers, and architecture visibility rules already existed; the missing work was the
  orchestration route that ties them together.
- **`src/app/api/simulation/analyze/route.ts`** — new POST route:
  - Gated with `requirePermission('runWhatIfSimulations')`, so VIEWERs cannot create simulation
    history rows while ANALYST/CAB_APPROVER/ADMIN can.
  - Accepts `{ architectureId, targetNodeId, simulationType, parameters? }`, validates the
    architecture id and simulation type against the existing `SIMULATION_TYPES` constant, and
    rejects non-object `parameters`.
  - Loads the saved Architecture from Mongo and applies the same owner/shared/department read rules
    already used by the architecture detail route before allowing analysis.
  - Computes the local blast radius from the *saved* architecture edges via
    `src/lib/graph/blastRadius.ts`, not the live Neo4j graph, so the result reflects the chosen
    what-if topology rather than current production reality.
  - When the target node id is one of the backend-supported simulation types
    (`cpu_spike` / `memory_leak` / `disk_full` / `network_storm` / `node_failure`) and the node
    also exists in the live fleet, calls FastAPI `POST /simulation/run` and prefers its
    authoritative `result_json` + backend blast radius. If that live mirror fails or the node
    does not exist live, the route cleanly falls back to the local architecture-derived result
    instead of failing the whole request.
  - Persists every request as a Mongo `SimulationRun` with `architectureId`, `targetNodeId`,
    `simulationType`, final `blastRadius`, `riskScore`, `projectedDowntime`, raw `resultJson`,
    nullable `backendSimId`, and `runBy`.
  - Calls `logActivity({ action: 'simulation.analyze', ... })` with the chosen architecture,
    source (`frontend` vs `backend`), affected-node count, and any backend-fallback warning.
  - Returns `201 { simulationRun: ... }`, including the persisted run id plus the final
    authoritative-or-local result fields the next Phase 3 wiring task can consume.
- Files touched:
  - `src/app/api/simulation/analyze/route.ts`
  - `context/IMPLEMENTATION_PLAN.md`
  - `context/CONTEXT.md`
- Real bug found along the way:
  - The frontend still had no server route for scenario analysis at all; `simulation.service.ts`
    was posting `/simulation/analyze` straight to FastAPI, which does not exist. This iteration
    fixes the missing Next.js route required by the plan. The service/page wiring that switches the
    UI over to it is intentionally left for the next Phase 3 tasks rather than being bundled into
    this one.
- Verified:
  - `cmd /c npx tsc --noEmit` — clean.
  - `cmd /c npx next build` — clean; only the known pre-existing `middleware`→`proxy`
    deprecation warning remains.
  - `cmd /c npx eslint src/app/api/simulation/analyze/route.ts` — clean.
- Next task in Phase 3: derive impact vectors, downtime distribution, and compliance flags from
  the graph + `NodeBusinessMeta`, replacing `lib/mockData/mockSimulation.ts` as the source.

**2026-08-29 — Phase 2 task 5: `/simulation/architectures` library page (Codex)**
- Task: first unchecked code-implementation item in the lowest incomplete phase after the two
  remaining Phase 1 manual/runtime verification items. This fit in a single iteration: the
  architecture APIs and Scenario Builder save/load/share plumbing already existed; the missing
  work was a dedicated architecture library surface over them.
- **`src/app/simulation/architectures/page.tsx`** — new client page:
  - Fetches `GET /api/architectures` and buckets the returned summaries into the three required
    tabs: `mine` (`isOwner`), `shared-with-me` (`!isOwner && visibility === 'shared'`), and
    `department` (`!isOwner && visibility === 'department'`).
  - Renders per-tab counts, empty states, and a card grid with visibility badge, nodes, edges,
    version, last-updated time, department, and recipient count.
  - Adds the minimum practical actions for a library page without expanding scope into a second
    management UI: `Open` (loads into Scenario Builder via query param), `Manage` for owned
    architectures (opens the same builder flow where the existing toolbar already exposes Save /
    Share), and owner-only `Delete` (calls the already-built `DELETE /api/architectures/[id]`).
  - Uses the app’s existing `Button`/`Card` primitives and route constants rather than creating
    page-local UI abstractions.
- **`src/app/simulation/scenario-builder/page.tsx`**:
  - Added `?architectureId=` loading so the new library page can hand off directly into the
    builder. On first visit with a query param, the page fetches `/api/architectures/[id]`,
    hydrates the canvas with stored `nodes`/`edges`, and updates
    `useAppStore`’s `currentArchitectureId` / `currentArchitectureName`.
  - Added compact inline status/error copy in the existing left-rail canvas controls so a failed
    library handoff is visible without needing browser-console inspection.
- **`src/lib/constants.ts`**:
  - Added `ROUTES.ARCHITECTURES` and included it in `NAV_GROUPS` so the route map knows about the
    new page; no separate route-string duplication introduced.
- Files touched:
  - `src/app/simulation/architectures/page.tsx`
  - `src/app/simulation/scenario-builder/page.tsx`
  - `src/lib/constants.ts`
  - `context/IMPLEMENTATION_PLAN.md`
  - `context/CONTEXT.md`
- Real bug found along the way:
  - The first draft of the Scenario Builder query-param handoff would have re-fetched the same
    architecture repeatedly after load because the guard state was tracking only the in-flight id,
    not the last successfully-loaded id. Fixed by tracking `loadedArchitectureId` separately.
  - Touching `Navbar.tsx` immediately pulled the known pre-existing `react-hooks/set-state-in-effect`
    lint error into the changed-file set, so the nav edit was intentionally backed out to keep this
    iteration scoped and the hard verification gate green.
- Verified:
  - `cmd /c npx tsc --noEmit` — clean.
  - `cmd /c npx next build` — clean; only the known pre-existing `middleware`→`proxy`
    deprecation warning remains.
  - `cmd /c npx eslint src/app/simulation/architectures/page.tsx src/app/simulation/scenario-builder/page.tsx src/lib/constants.ts` — clean.
- Next task in Phase 3: `POST /api/simulation/analyze` — compute blast radius over the chosen
  saved architecture, call FastAPI `POST /simulation/run` when the target also exists in the live
  fleet, and persist the result as a `SimulationRun`.

**2026-08-29 — Phase 2 task 4: Scenario Builder toolbar (Codex)**
- Task: first unchecked code-implementation item in the lowest incomplete phase after skipping the
  earlier manual-only/browser-only Phase 1 checks per the program rules. This task fits in a
  single iteration because the heavy lifting already existed in `ScenarioToolbar.tsx`; the missing
  work was wiring it into the actual Scenario Builder screen.
- **`src/app/simulation/scenario-builder/page.tsx`**:
  - Mounted the existing `ScenarioToolbar` at the top of the left rail, above the canvas controls.
  - Added `handleLoadArchitecture(loadedNodes, loadedEdges)` and passed it to the toolbar's
    `onLoad` prop so the Load modal now hydrates the canvas with the selected saved architecture.
  - Left the existing Save / Save As / Share behavior in the shared toolbar component intact; it
    already updates `useAppStore`'s `currentArchitectureId` / `currentArchitectureName`, calls the
    Phase 2 architecture APIs, and opens the three modals from the same screen.
  - Removed a pre-existing unused `HEALTH_COLORS` import from the page so the changed-file ESLint
    gate is clean.
- The store work requested by the plan (`currentArchitectureId` alongside `currentPlan`) was
  already present in `src/store/useAppStore.ts` from a prior session; no additional store changes
  were needed in this pass.
- Files touched:
  - `src/app/simulation/scenario-builder/page.tsx`
  - `context/IMPLEMENTATION_PLAN.md`
  - `context/CONTEXT.md`
- Real bug found along the way: not a runtime bug, but the page carried a stale unused import
  (`HEALTH_COLORS`) that tripped ESLint as soon as this file became part of the changed set.
  Removed it.
- Verified:
  - `cmd /c npx tsc --noEmit` — clean.
  - `cmd /c npx next build` — clean; only the known pre-existing `middleware`→`proxy`
    deprecation warning remains.
  - `cmd /c npx eslint src/app/simulation/scenario-builder/page.tsx` — clean.
- Next task in Phase 2: `/simulation/architectures` library page — tabs for mine / shared-with-me /
  department.

**Project Identity**
- **Name:** InfraMind — AI-Powered Digital Twin Platform for Waters Corporation
- **Hackathon:** Smart Horizon 2026 | **Team:** Who Let The Logs Out
- **Design Aesthetic:** Mission control meets Bloomberg Terminal — dense, information-rich, zero decoration that doesn't carry data. Dark mode only.

**Tech Stack**
- **Framework:** Next.js 14/16 (App Router)
- **Styling:** Tailwind CSS (v4 via `@theme` in `globals.css`)
- **State Management:** Zustand + Immer
- **Visualization:** Recharts, React Flow (`@xyflow/react`)
- **Animations:** Framer Motion, pure CSS keyframes

---

## Content Split & Navigation Architecture

The application is strictly divided into two distinct top-level environments:

**1. DIGITAL TWIN (Live Monitoring)**
The mission control observation deck. Read-only. Live reality only. Zero hypothetical vectors here.
- `/digital-twin` — Live topology graph, Health overview donut, Active alerts, Cert tracker.
- `/digital-twin/node-health` — Real-time metrics grid and sparklines.
- `/digital-twin/model-accuracy` — Prediction vs Actuals tracking and model drift metrics.

**2. SIMULATION LAB (Hypothetical Modeling)**
The war room. All predictive, analytical, and "what-if" tools live here.
- `/simulation/scenario-builder` — NL graph editing, live simulation vectors, blast radius, business process impact, self-healing.
- `/simulation/replay` — Timeline of past simulations, ghost state viewers, outcome logging.
- `/simulation/shadow-run` — Side-by-side live vs simulated execution delta.
- `/simulation/cab-copilot` — AI-generated briefing, revenue exposure charting, interactive CAB chat.

---

## Route Map

| URL | Component | Status |
|---|---|---|
| `/digital-twin` | Digital Twin (Mission Control) | ✅ Complete |
| `/digital-twin/node-health` | Node Health Dashboard | ✅ Complete |
| `/digital-twin/model-accuracy` | Model Accuracy | ✅ Complete |
| `/simulation/scenario-builder` | Scenario Builder | ✅ Complete |
| `/simulation/replay` | Replay | ✅ Complete |
| `/simulation/shadow-run` | Shadow Run | ✅ Complete |
| `/simulation/cab-copilot` | CAB Co-Pilot | ✅ Complete |

---

## Graph Data Contract (Decoupled Neo4j)

The dependency graph no longer relies on hardcoded components. `graphService.getLiveGraph()` returns:
```typescript
interface LiveGraphData {
  nodes: GraphNode[]  // id, label, type, healthScore, dependencyCount, layer, metadata
  edges: GraphEdge[]  // id, source, target, type, latency
  lastSync: string
}
```
Visual mappings are computed client-side in `CustomNode`:
- Size is proportional to `dependencyCount`.
- Color maps strictly to `healthScore`: `>= 80` (Green), `>= 50` (Amber), `> 0` (Red), `0` (Grey).

**Mock Data Reference:**
The mock topology (`src/lib/mockData/mockGraph.ts`) maps the exact Waters infrastructure: Empower, NuGenesis, UNIFI, ActiveDirectory, Citrix, VMware, IIS, Wildfly, etc.

---

## API Plugin Map

| Service Name | File | Primary Methods |
|---|---|---|
| graphService | `graph.service.ts` | `getLiveGraph`, `getSimulationGraph`, `filterNodes` |
| nodeHealthService | `nodeHealth.service.ts` | `getMetrics`, `triggerHealing` |
| simulationService | `simulation.service.ts` | `analyzeScenario`, `getSimulationVectors`, `getDowntimeDistribution` |
| remediationService | `remediation.service.ts` | `getActiveRecs`, `executeAction` |
| businessProcessService | `businessProcess.service.ts` | `getImpactMap`, `notifyTeam` |
| nlService | `nl.service.ts` | `processQuery` |
| modelAccuracyService | `modelAccuracy.service.ts` | `getAccuracyMetrics`, `getPredictions`, `getDriftMetrics`, `triggerRetrain` |
| scenarioService | `scenario.service.ts` | `getPlans`, `savePlan`, `simulatePlan` |
| shadowRunService | `shadowRun.service.ts` | `getLiveMetrics`, `getSimulatedMetrics`, `startRun` |
| replayService | `replay.service.ts` | `getHistoryEvents`, `logOutcome` |
| cabService | `cab.service.ts` | `getRevenueImpact`, `generateReport`, `chat` |

---

## Design Tokens (`globals.css`)

- **brand-bg:** `#0A0A0B` (Primary background)
- **brand-surface:** `#111114` (Cards, panels)
- **brand-surface-2:** `#1E1E24` (Hover states)
- **brand-border:** `#2B2B36`
- **emerald:** `#10B981` (Healthy)
- **amber:** `#F59E0B` (Warning)
- **crimson:** `#EF4444` (Critical)
- **cyan:** `#00D4FF` (Interactive/AI/Simulated)
- **Typography:** JetBrains Mono (metrics, code, data), Inter (prose).
- **Radius:** Capped at `4px` (`rounded` / `rounded-md`). No fully rounded pill buttons except for tiny badges or node circles.

---

## Status Update

**2026-08-29 — Phase 2 task 3: `POST /api/architectures/[id]/share` (Claude)**
- Task: third task in Phase 2 — share/unshare an architecture with specific org members.
- **`src/app/api/architectures/[id]/share/route.ts`** — single POST handler:
  - Auth: any ACTIVE member via `getCurrentMembership()` (403 if inactive).
  - Ownership gate: only the owner (`ownerClerkId === membership.clerkUserId`) can mutate `sharedWith`.
  - Body: `{ add?: string[], remove?: string[] }` — both arrays of User._id strings (ObjectIds),
    the same `userId` field returned by `GET /api/team/members`.
  - All supplied IDs validated as legitimate ObjectIds before touching the DB; first malformed
    ID short-circuits with a 400 `{ error: "Invalid user id: <id>" }`.
  - Removes applied first, then adds; duplicates collapsed via a `Set<string>`. Attempting to
    add the owner's own userId is silently skipped (no-op — they're already the owner).
  - Saves the updated doc and calls `logActivity({ action: 'architecture.share', ... })` with
    `addCount`, `removeCount`, and `sharedWithCount` in metadata.
  - Returns `{ sharedWith: string[] }` — the full updated list of User._id strings so the
    Share modal can refresh without a second GET.
- `add` and `remove` may be used together in a single request (e.g. replace a recipient list).
- Verified: `npx tsc --noEmit` clean (0 errors), `npx next build` clean — route registers as
  `/api/architectures/[id]/share` (now 31 routes total), `npx eslint
  src/app/api/architectures/[id]/share/route.ts` — 0 errors, 0 warnings.
- **Next task in Phase 2:** Scenario Builder toolbar — Save / Save As / Load modal / Share modal.
  Track `currentArchitectureId` in `useAppStore` alongside the existing `currentPlan`.

**2026-08-29 — Phase 2 task 2: `GET/PATCH/DELETE /api/architectures/[id]` (Claude)**
- Task: second task in Phase 2 — architecture detail / update / delete API.
- **`src/app/api/architectures/[id]/route.ts`** — three handlers:
  - **GET** — any ACTIVE member. Visibility gate via `canRead()`: owner (ownerClerkId match),
    sharedWith (ObjectId in array), or department member (visibility='department' + dept match).
    Returns full architecture including `nodes` and `edges` arrays (unlike the list route, which
    omits them for performance). Also returns convenience fields: `nodeCount`, `edgeCount`, `isOwner`.
  - **PATCH** — owner-only (ownerClerkId check after 404 guard). Accepts any subset of
    `{ name, description, nodes, edges, visibility, department }`. Each field is validated
    only when present: name → non-empty string; visibility → in `ARCHITECTURE_VISIBILITIES`;
    department → in `DEPARTMENTS` or null. Increments `version` by 1 on every save.
    Calls `logActivity({ action: 'architecture.update', ... })`. Returns full updated doc.
  - **DELETE** — owner-only. Calls `doc.deleteOne()` then `logActivity({ action: 'architecture.delete', ... })`.
    Returns `{ deleted: true }`.
- `isValidObjectId()` helper guards all three verbs — malformed IDs return 400 before hitting Mongo.
- Verified: `npx tsc --noEmit` clean (0 errors), `npx next build` clean — `/api/architectures/[id]`
  registers correctly alongside the existing list route (now 30 routes total), `npx eslint
  src/app/api/architectures/[id]/route.ts` — 0 errors, 0 warnings.
- **Next task in Phase 2:** `/api/architectures/[id]/share` — POST, user picker backed by `/api/team/members`.

**2026-08-29 — Phase 2 task 1: `GET /api/architectures` + `POST /api/architectures` (Claude)**
- Task: first task in Phase 2 — architecture list/create API. Phase 1's two remaining
  unchecked tasks both require a live browser or live backend+agent (documented in prior
  CONTEXT.md entries); they cannot be completed in this automated environment and are left
  unchecked per the plan's guidance ("say so in CONTEXT.md and leave the box unchecked").
  Proceeded to Phase 2's first code task.
- **`src/app/api/architectures/route.ts`** — two handlers:
  - **GET** — any ACTIVE member (getCurrentMembership + 403). Scope: `$or` of
    `{ ownerClerkId }` (mine) | `{ visibility: 'department', department }` (dept-shared,
    only when the caller has a non-null department) | `{ sharedWith: userId }` (shared
    with me). Sorted by `updatedAt` desc, capped at 100. Returns summary rows — nodes/edges
    arrays excluded from the query for performance; the list view only needs name, counts,
    metadata. Per-architecture: `{ id, name, description, visibility, department, ownerId,
    ownerClerkId, sharedWith[], version, nodeCount, edgeCount, createdAt, updatedAt, isOwner }`.
    `isOwner` is a convenience flag so the library page can sort into tabs client-side
    without a second round-trip.
  - **POST** — same gate. Body: `{ name (required), description?, nodes?, edges?,
    visibility? (default 'private'), department? }`. Validates: name non-empty, visibility
    in ARCHITECTURE_VISIBILITIES, department (if provided) in DEPARTMENTS. Creates the doc
    with `ownerId` + `ownerClerkId` from the resolved membership — the caller cannot forge
    a different owner. Calls `logActivity({ action: 'architecture.create', ... })`. Returns
    the full created architecture including nodes/edges (201). The response also includes
    `isOwner: true` as a convenience — the creator always owns what they just made.
- **Department clause guard:** the $or only includes `{ visibility: 'department', department:
  membership.department }` when `membership.department` is truthy. If somehow a membership
  has a null department, this prevents accidentally matching all `department`-visibility
  architectures that also have null department.
- **Type casting:** `ARCHITECTURE_VISIBILITIES` and `DEPARTMENTS` are `as const` readonly
  tuples; `.includes()` requires `unknown as string[]` double-cast to avoid the
  `readonly vs mutable` TS error. The validated `vis` string is then cast to
  `ArchitectureVisibility` (and `department` to `Department | null`) before passing to
  `Architecture.create()` so Mongoose's typed overloads resolve correctly.
- Verified: `npx tsc --noEmit` clean (0 errors), `npx next build` clean — `/api/architectures`
  registers as a new dynamic route (now 29 routes total), `npx eslint
  src/app/api/architectures/route.ts` — 0 errors, 0 warnings.
- **Next task in Phase 2:** `/api/architectures/[id]` — GET / PATCH / DELETE, ownership-checked.

**2026-08-29 — Phase 1 task 5: Manual browser pass on `/digital-twin` (Claude)**
- Task: click several node types, confirm the drawer, panels, filters, hover tooltips,
  re-layout and neighbor-dimming all render correctly.
- **Browser pass not possible in this automated environment** — same constraint as the prior
  session (the 2026-08-27 node-icons session that first flagged this owed pass). No headless
  browser / Playwright is available, and the page sits behind Clerk auth.
- **Substitute: thorough static + compilation review.**
  - `npx tsc --noEmit` — clean (0 errors, 0 new).
  - `npx next build` — clean, all 28 routes register including `/digital-twin`.
  - `digital-twin/page.tsx` — load flow, WS subscription, filter logic, health-data splitting
    (nonSimNodes / simulatingNodes), criticalNodes / atRiskNodes buckets, and the sidebar cards
    reviewed. No logic bugs found.
  - `FlowCanvas.tsx` — neighbor-dimming (neighborIds useMemo over graphEdges), position
    preservation (positionById map survives re-renders), re-layout button (calls
    `layoutWithDagre` then `fitView`), read-only drag support (filters only `'remove'`
    NodeChanges) all present and wired correctly.
  - `GraphNode.tsx` — isSimulating → cyan dot, isDimmed/isNeighbor opacity fade, hover tooltip,
    incident badge, size-by-dependencyCount all correct. `getNodeTypeConfig` fallback to
    `infrastructure` means an unknown type never crashes.
  - `GraphFilterBar.tsx` — NODE_TYPE_CATEGORIES chip toggles, DEPARTMENTS department chips,
    viewer identity indicator, clear-filters button all correct.
  - `panels/index.ts` — all 14 NodeType variants mapped (including generic fallbacks
    cloud/container/infrastructure). `getNodeTypePanel` has its own fallback to `ServerPanel`.
    `VirtualizationHostPanel` — "Hosted Workloads" derives from `allNodes.filter(n =>
    node.dependencies.includes(n.id))` (real graph data) and each row calls `onJumpToNode?.(h.id)`
    — the jump-to-node flow is correctly wired through `NodeInspector → handleJumpToNode →
    setSelectedNode + setInspectorOpen`.
  - `NodeInspector.tsx` — base section (HealthGauge, type icon, region, health badge),
    type-specific panel (border-wrapped, `getNodeTypePanel(node.type)`), sparkline trend,
    utilization bars, dependencies/dependents, alerts, remediation actions (including inline
    execute result feedback), credentials section all present and correct.
- **Known remaining items a browser pass would need to verify** (can't rule out by code review):
  1. React Flow renders nodes without white-flash / hydration mismatch on the dynamic import.
  2. SlideOver drawer opens at the correct z-index over the right rail when the rail is open.
  3. Hover tooltip doesn't clip at canvas edges (it uses `bottom-full`, which can overflow upward
     at nodes near the top of the viewport).
  4. Re-layout button: dagre produces a non-overlapping layout for the mock 12-node graph
     (depends on dagre version + edge direction; no runtime evidence).
  5. Department filter chips work on mock data (live FastAPI nodes have no `department` field).
- **Task left unchecked** — a real browser pass is required to tick this. The user or a future
  session with browser access should load `/digital-twin`, click several node types (server,
  database, network_device, virtualization_host at minimum), confirm the slide-over drawer opens
  with the correct type panel, click the re-layout button, and confirm neighbor-dimming fires on
  node selection. If all five items above pass visually, tick the box.
- **Next task in Phase 1:** "Re-verify the two already-fixed P1 items end-to-end" — also
  requires a live backend + agent. Same environment limitation applies.

**2026-08-29 — Phase 1 task 4: Auto-arrange on Scenario Builder (Claude)**
- Task: `FlowCanvas` has a `showRelayoutButton` prop (dagre-backed re-layout button, added in the
  node-icons session) but it was not passed at `scenario-builder/page.tsx:230`. The Scenario
  Builder canvas had no way to trigger the auto-arrange layout at all.
- **`src/app/simulation/scenario-builder/page.tsx:230`** — added `showRelayoutButton` to the
  `<FlowCanvas>` call. One-line change; no new files, no logic changes.
- The re-layout button is rendered by `FlowCanvas` → `FlowCanvasInner` → the `showRelayoutButton`
  branch that calls `lib/graph/layout.ts`'s `applyDagreLayout()` and then `fitView()`. All of that
  machinery was already wired and working on the digital-twin page (which passes
  `showRelayoutButton` in its own canvas config); the scenario-builder was just missing the prop.
- Pre-existing warning on the file: `HEALTH_COLORS` imported but unused — not introduced by this
  change, present before.
- Verified: `npx tsc --noEmit` clean, `npx next build` clean (all 28 routes still register),
  `npx eslint src/app/simulation/scenario-builder/page.tsx` — 0 errors, 1 pre-existing warning.
- **Next task in Phase 1:** "Manual browser pass on `/digital-twin`" — still owed from the
  node-icon session (no headless browser available). Click several node types, confirm the drawer,
  panels, filters, hover tooltips, re-layout and neighbor-dimming all render correctly.

**2026-08-29 — Phase 1 task 3: Remediate works (Claude)**
- Task: `remediationService.executeAction()` POSTed to `/remediation/execute/{id}` on FastAPI
  → 404. FastAPI has no `/remediation/*` routes. Three Next.js API routes added and the
  service + health service + NodeInspector + node-health page all wired together.
- **`src/app/api/remediation/recommendations/route.ts`** — GET `?nodeId=`. Auth-gated to any
  ACTIVE member via `getCurrentMembership()`. In real mode: calls FastAPI
  `/nodes/{id}`, `/nodes/{id}/metrics?limit=1`, `/nodes/{id}/alerts?active_only=true`,
  `/nodes/{id}/blast-radius` in parallel via `Promise.allSettled` (individual backend
  failures are tolerated — defaults are safe). Derives up to 5 `RemediationAction` objects
  sorted by `rankScore` desc: emergency restart (critical alerts), isolate node (≥5 dependents),
  failover to standby (3–4 dependents), reduce CPU load (CPU≥85%), clear memory cache (MEM≥80%),
  archive disk (DISK≥90%), plus a baseline restart always included. In mock mode: returns the
  two static mock actions that `nodeHealthService` previously returned inline.
- **`src/app/api/remediation/execute/route.ts`** — POST `{ actionId, nodeId, actionName? }`.
  Auth-gated. Calls `logActivity({ action: 'remediation.execute', targetType: 'Node',
  targetId: nodeId, metadata: { actionId, actionName } })` then returns
  `{ taskId, status: 'initiated', loggedAt }`. The taskId is `task-${Date.now()}` — no real
  backend task runner exists; the ActivityLog row is the receipt. Any `logActivity` failure
  propagates as a 500 (consistent with the helper's "don't swallow" contract).
- **`src/app/api/remediation/runbook/route.ts`** — GET `?actionId=`. Auth-gated. Derives
  step-by-step runbook from the actionId pattern (emergency/restart, memory/cache, cpu/load,
  disk/archive, isolate, failover, generic fallback). Returns `{ title, steps: string[] }`.
- **`src/services/remediation.service.ts`** — rewritten. `executeAction(actionId, nodeId,
  actionName?)` now POSTs to `/api/remediation/execute` (internal Next.js) via `fetch`.
  `generateRunbook(actionId)` GETs `/api/remediation/runbook`. New `getNodeRecs(nodeId)` GETs
  `/api/remediation/recommendations`. `getActionStatus()` param dropped (was unused, nobody
  calls it); returns synthetic completed state. `getActiveRecs()` stays mock-only (simulation
  lab concept, no backend). All remediation routes now call `fetch` (not the `api` axios
  client which points at FastAPI) — same pattern `nlService` uses for the NL route.
- **`src/services/nodeHealth.service.ts`** — `getRemediationActions(nodeId)` now delegates to
  `remediationService.getNodeRecs(nodeId)` instead of returning a hardcoded mock array. The
  inline `mockRemediationActions` constant was removed. `remediateNode` (still mock-only) was
  not touched — its pre-existing `actionId` unused-param warning was already present before.
- **`src/components/graph/NodeInspector.tsx`** — three changes:
  1. `handleExecute` now accepts `{ id, name }` (not just `actionId`) and passes `node.id` +
     `action.name` to `remediationService.executeAction()`.
  2. New `executeResult` state `{ id, ok, message }` shows an inline success (emerald) or
     error (crimson) line below the executed action row immediately after the await resolves.
  3. `executeResult` is cleared when the inspector closes/resets (alongside the other state
     cleanup in the `useEffect`).
- **`src/app/digital-twin/node-health/page.tsx`** — `handleRemediate(nodeId)` replaced: instead
  of calling the mock `nodeHealthService.remediateNode(nodeId, 'ra-001')`, it now finds the
  node in the loaded `nodes` list and opens the NodeInspector slide-over for it. The user sees
  real derived recommendations with functional Execute buttons. Signature is `async` to satisfy
  `NodeCardProps.onRemediate: (id) => Promise<void>`.
- **ESLint audit on all 7 changed files:**
  - 2 errors: pre-existing `react-hooks/set-state-in-effect` at `node-health/page.tsx:245`
    and `NodeInspector.tsx:82` — both documented noise in the plan's verification gate.
  - 3 warnings: `Badge` unused import in `node-health/page.tsx` (pre-existing), `_nodeId`/
    `actionId` unused in `nodeHealth.service.ts`'s untouched `remediateNode` method
    (pre-existing — those params were always unused and the line just moved due to the
    removed `mockRemediationActions` array).
  - No new ESLint issues introduced.
- Verified: `npx tsc --noEmit` clean, `npx next build` clean — 28 routes (was 25), the three
  new remediation routes all registered.
- **Next task in Phase 1:** "Auto-arrange on Scenario Builder" — `showRelayoutButton` prop
  not passed at `scenario-builder/page.tsx:230`.

**2026-08-29 — Phase 1 task 2: Simulating nodes must not read as failures (Claude)**
- Task: `classifyHealth()` in `backendAdapters.ts` ignored the backend's `simulating` status
  and graded synthetic simulation metrics as genuine degradation, pushing the target node of a
  cpu_spike / memory_leak run into the At Risk or Critical lists and coloring its graph dot amber
  or crimson when it should read as a controlled experiment, not an outage.
- **`src/types/graph.ts`** — added `isSimulating?: boolean` to `GraphNode`.
- **`src/lib/backendAdapters.ts`** — two changes:
  1. `classifyHealth()` now returns `'healthy'` when `status === 'simulating'` (before the
     health-score thresholds) — synthetic metrics no longer propagate into failure buckets.
  2. `adaptFullGraph()` sets `isSimulating: n.status === 'simulating'` on each adapted node.
- **`src/lib/constants.ts`** — added `simulating: '#00D4FF'` to `HEALTH_COLORS`. Cyan is the
  design-token reserved for "Interactive / AI / Simulated" throughout the design system.
- **`src/components/graph/GraphNode.tsx`** — status dot now checks `nodeData.isSimulating`
  first; if true, uses `HEALTH_COLORS.simulating` (cyan) instead of the health-derived color.
- **`src/app/digital-twin/page.tsx`** — four changes:
  1. Pre-split `nodes` into `nonSimNodes` / `simulatingNodes` at the top of the derived section.
  2. `healthData` (health donut) now counts from `nonSimNodes` for the four failure buckets,
     plus a new "Simulating" slice (cyan) for `simulatingNodes`.
  3. `atRiskNodes` and `criticalNodes` filter from `nonSimNodes` only — a simulating node
     cannot appear in either list regardless of its current health score.
  4. WebSocket `node.status_changed` handler now sets `isSimulating: payload.status === 'simulating'`
     alongside the existing `healthScore` / `health` updates.
  5. New "Simulating" sidebar card (cyan border, pulsing dot) renders above Critical/Offline
     when any simulating nodes exist, showing their names and a "SIM" badge.
- ESLint on all changed files: the two errors reported on `digital-twin/page.tsx` are the
  pre-existing `@typescript-eslint/no-explicit-any` on `DarkTooltip` and `react-hooks/
  set-state-in-effect` on the load effect — both documented pre-existing noise in the plan's
  verification gate. No new lint issues introduced.
- Verified: `npx tsc --noEmit` clean, `npx next build` clean (all 25 routes still register).
- **Next task in Phase 1:** "Remediate works" — `remediation.service.ts` POSTs to `/remediation/execute/{id}` → 404.

**2026-08-29 — Phase 1 task 1: Critical ≠ At Risk (Claude)**
- First unchecked Phase 1 task: the "At Risk" panel in the digital-twin sidebar was
  filtering `healthScore < 80`, which swept degraded (50–79) *and* critical (<50) *and*
  unreachable (0) nodes into one undifferentiated list, contradicting `nodeHealth.service.ts`'s
  `atRisk = degraded` bucket.
- **`src/app/digital-twin/page.tsx`** — two targeted changes:
  1. `atRiskNodes` now filters `n.health === 'degraded'` (healthScore 50–79 only), capped at 6.
  2. New `criticalNodes` computed from `n.health === 'critical' || n.health === 'unreachable'`,
     sorted ascending by healthScore, capped at 6.
  3. Sidebar: a new **"Critical / Offline"** card (crimson border, only shown when count > 0)
     renders above the existing "At Risk" (amber) card. Each row shows a status dot, node
     label, and healthScore in the appropriate color. "All nodes healthy" placeholder replaced
     with "No degraded nodes" to stay accurate now that criticals live elsewhere.
- Both lists are independent — a node with `health === 'critical'` cannot appear in the
  "At Risk" list, matching `nodeHealth.service.ts`'s authoritative bucket split.
- The health donut (`healthData` computed from healthScore thresholds on lines 162–167) was
  already correct — it already had separate "Critical" and "Amber" buckets — so no change there.
- ESLint: the two pre-existing errors on this file (`@typescript-eslint/no-explicit-any` on
  `DarkTooltip`, `react-hooks/set-state-in-effect` on the load effect) remain unchanged —
  documented pre-existing noise per the plan's verification gate.
- Verified: `npx tsc --noEmit` clean, `npx next build` clean (all routes still register).
- **Next task in Phase 1:** "Simulating nodes must not read as failures" — `classifyHealth()`
  in `backendAdapters.ts:131` ignores `simulating` status.

**2026-08-29 — Phase 0 close: `GET /api/team/members` (Claude)**
- Last unchecked task in Phase 0 was the share-picker's member-list route.
  The plan spelled the contrast out — "Gate with `requireActiveMembership`,
  **not** admin-only (unlike the existing `/api/admin/members`)" — because
  the Phase 2 share modal has to let any active member pick recipients from
  the whole org, while `/api/admin/members` (the admin team-management UI)
  is `requireRole(['ADMIN'])`. Same collection, different audience, different
  gate.
- **`src/app/api/team/members/route.ts`** — one `GET` handler. Flow: resolve
  actor via `getCurrentMembership()` (the API-route equivalent of
  `requireActiveMembership()` — see "Deliberate deviations" below for why the
  literal function isn't called), 403 if not ACTIVE, then the same
  `Membership.find({ status: 'ACTIVE', ... })` + `User.find({ _id: { $in } })`
  join pattern the admin route uses, sorted by `activatedAt` desc and capped
  at 200. Optional `?q=` search runs an anchored-substring regex over
  `User.name` / `User.email` (uses the existing `escapeRegex` helper so a
  user typing `foo.bar+baz@example.com` doesn't blow up on the `.`/`+`),
  narrowing the Membership filter to just those user ids.
- **Response shape**: `{ members: [{ userId, email, name, department, role }] }`.
  The single most important delta from `/api/admin/members` is `userId` —
  that's `String(Membership.userId)`, i.e. the Mongo `User._id`, which is
  exactly what `Architecture.sharedWith[]` references (see the model:
  `sharedWith: [{ type: Schema.Types.ObjectId, ref: 'User' }]`). Admin/members
  returns `membershipId` because that route feeds a team-management UI where
  the row-scoped actions (role change, revoke) target the Membership doc; the
  share picker doesn't touch memberships at all, it just needs the User id it
  will later store on the Architecture. Dropped `membershipId`, `clerkUserId`,
  `activatedAt` for the same reason — no share-picker use for them, so no
  point widening the wire payload.
- **Deliberate deviations a future agent might otherwise "correct":**
  - **`getCurrentMembership()` in the route body, not `requireActiveMembership()`
    despite the plan mentioning the latter by name.** `requireActiveMembership`
    is the *server-component* helper — it calls `redirect('/sign-in')` /
    `redirect('/waiting-approval')` on failure, which throws a `NEXT_REDIRECT`
    that Next.js turns into a 307 with a `Location` header. In an API route
    hit by `fetch()` from a client component (the Phase 2 share picker),
    a 307 to `/sign-in` is worse than a plain 403 JSON — the picker sees a
    redirect body, not the error it can render. Every other API route in this
    repo uses either `requireRole(['ADMIN'])` (the `{ ok, response }` pattern
    that returns 401/403 NextResponse JSON) or, for the "any active user"
    case, calls `getCurrentMembership()` and returns a JSON error itself —
    see `src/app/api/me/route.ts` for the same pattern. The plan bullet's
    "requireActiveMembership" is the *concept* (any ACTIVE member, not
    admin-only); `getCurrentMembership()` is the API-route implementation of
    that concept, matching the codebase convention. If a future agent
    "corrects" this to literally call `requireActiveMembership()`, an
    unauthenticated `fetch('/api/team/members')` will 307-redirect to
    `/sign-in` instead of returning 401/403 JSON and every caller will
    break.
  - **`userId: { $ne: membership.userId }` filters the caller out of their
    own share-picker.** A user cannot share an architecture with themselves
    — they're already the owner (`Architecture.ownerId`), and `sharedWith[]`
    is explicitly the *additional* recipients. Excluding self server-side
    means the picker can't accidentally offer "share with me", the payload
    is one row lighter, and Phase 2's UI doesn't have to remember to filter.
    The alternative (return self, let UI filter) was rejected because it's
    the kind of small direction-correct restriction that belongs at the
    source — the same reasoning that put the `status: 'ACTIVE'` filter here
    rather than on the client.
  - **`{ $in: [...], $ne: caller.userId }` composed in one operator object
    when `?q=` is present, not `$and: [{ $in }, { $ne }]`.** Mongo allows
    multiple operators on one field in the same object and evaluates them
    all — semantically identical to `$and` but shorter and matches the shape
    the admin route uses for its own single-operator `$in`. String
    `membership.userId` auto-casts to ObjectId via Mongoose because the
    `Membership.userId` schema field is `Schema.Types.ObjectId` — same
    reason the admin route can pass raw `_id`s from a lean() result
    without an explicit `new Types.ObjectId(...)` wrap.
  - **200-row cap and `activatedAt` desc sort copied verbatim from
    `/api/admin/members`.** Two same-shape endpoints reading the same
    collection should paginate/sort the same way; if Phase 2's picker
    outgrows 200 candidates the fix (cursor pagination? typeahead-only
    fetch?) will need applying to both routes consistently. Sort by
    `activatedAt` desc (newest members first) is what the admin team
    page uses because a person picking a share recipient usually knows
    the recent joiner they wanted to add — same intuition applies here.
  - **No department scoping.** The share picker is org-wide by design —
    a user in R&D sharing an architecture with someone in NETWORK_ENGINEERING
    is the whole point of Phase 2's Share flow. If dept-scoping is ever
    layered on top (e.g. "you can only share within your own dept"), it
    belongs on the Architecture write path (POST /api/architectures/[id]/share
    rejecting cross-dept recipients), not on the picker — the picker just
    lists candidates. Same reasoning /api/admin/members has no dept filter.
- **Verified**: `npx tsc --noEmit` clean, `npx eslint src/app/api/team/members/route.ts`
  clean, `npx next build` clean — the new `/api/team/members` route registers
  alongside the existing 22 (now 23 total). Deprecated-`middleware` warning
  remains the documented pre-existing noise.
- **Phase 0 is now closed.** Every model, every helper, every route it
  enumerated is `[x]`'d. The next agent should start on Phase 1's first
  unchecked bullet ("Critical ≠ At Risk" at
  `digital-twin/page.tsx:169`).

**2026-08-29 — Phase 0 cont.: `computeBlastRadius()` helper (Claude)**
- Next unchecked task in Phase 0 was `src/lib/graph/blastRadius.ts` — the
  BFS over an edge list that Phase 3's `/api/simulation/analyze` uses to
  derive impacted nodes + depth from the *chosen* architecture graph, and
  that Phase 4's shadow-run divergence helper leans on to compare live-side
  vs sim-side blast radius. The plan bullet is explicit: "Extend, do not
  duplicate, `computeDependencyLists` in graphUtils.ts."
- **`src/lib/graph/blastRadius.ts`** — one exported function
  `computeBlastRadius(originNodeId, edges, { maxDepth? })` returning
  `{ originNodeId, impacted: Array<{ nodeId, depth }> }`. BFS starts with
  origin in the visited set (so origin is not in the result — matches the
  Neo4j `WHERE affected.node_id <> $node_id` clause), walks outward one
  hop per iteration incrementing depth, and stops when either the
  frontier empties or `depth` reaches `maxDepth` (default 10, mirroring
  the Neo4j `[*1..10]` cap in
  `InfraMind.py/backend/database/neo4j_client.py::_get_blast_radius_tx`).
- **Edge direction — the single most important thing a future agent
  might get wrong here.** An edge `source → target` in this codebase
  means "source depends on target" (see the field comments in
  `types/graph.ts`: `dependencies` = ids this node depends on;
  `computeDependencyLists` puts each edge's `target` into `dependencies`
  when `source === nodeId`). So when `origin` fails, the nodes that
  break are the ones with a chain of edges *pointing to* origin — i.e.
  BFS follows the `dependents` adjacency (edges where the current
  frontier node is the `target`). This matches the Neo4j
  `(affected)-[*1..10]->(origin)` query exactly, so the two blast-radius
  sources Phase 3 will merge (Next.js-derived, and FastAPI's
  `POST /simulation/run` response) agree on which side of the arrow
  fails first.
- **Deliberate design decisions a future agent might otherwise "correct":**
  - **Uses `computeDependencyLists` as the adjacency oracle inside the
    BFS loop, rather than pre-building an adjacency map.** The plan
    bullet says "Extend, do not duplicate" — reading that as "reuse the
    same primitive so there is exactly one definition of dependency
    direction in the app" rather than "run computeDependencyLists once
    and cache". The reuse-in-loop approach is O(V·E) instead of O(V+E),
    which is meaningless at hackathon-fleet scale (dozens of nodes, ~100
    edges) but would matter at 10³+ nodes; that day, the fix is to
    factor a "build adjacency once" helper into graphUtils.ts (extending
    the same primitive further), not to duplicate the direction rule
    here. Kept the reuse pattern tight and honest for now.
  - **Origin is not in the impacted list.** Matches Neo4j's explicit
    `WHERE affected.node_id <> $node_id`. The caller already knows the
    origin — it's what they asked about — and Phase 3's blast-radius
    count / risk-score math would be off by one if origin were counted
    as impacted by its own failure. Origin is pre-seeded into `visited`
    so a cycle back to it in the walk doesn't re-add it either.
  - **Default `maxDepth: 10`, exposed as an option.** Same cap the
    FastAPI query uses. Two reasons a JS BFS still needs it even though
    a `visited` set already prevents infinite loops: (1) parity with
    the backend — if the Neo4j-side result truncates at depth 10, the
    frontend-derived one should too, or the two sources of truth for
    the same blast radius will disagree on whether a 12-hop-deep node
    is included; (2) a caller doing per-tick recomputation on a live
    ~1000-node fleet gets a bounded worst-case runtime instead of
    walking the whole reachable subgraph every frame. Option override
    exists because the Phase 4 divergence helper may reasonably want
    a full walk (`{ maxDepth: Infinity }`) on smaller saved
    architectures where the tenth-hop cap actively hides differences.
  - **BFS increments depth *before* expanding the frontier, not after.**
    Level-order iteration: the initial frontier is `[origin]` at logical
    depth 0, its one-hop neighbours land at depth 1, their neighbours
    at depth 2, and so on. The alternate ordering (increment after
    expansion) would put origin's direct dependents at depth 0, which
    is wrong — depth is "distance from origin" and origin is at 0
    itself. Verified against the Neo4j `shortestPath` semantics: a
    one-hop dependent has path length 1.
  - **Return shape wraps `impacted` in `{ originNodeId, impacted }`
    rather than being a bare array.** `SimulationRun.blastRadius` in
    the schema is `[Mixed]` — a bare array — so persistence callers
    will spread `.impacted` into it. Keeping the wrapper on the helper
    signals which node the depths are measured *from* (so a caller
    can log/render the origin without having to remember what they
    passed in), and matches the FastAPI `BlastRadius` schema exactly
    (`origin_node_id` + `affected_count` + `affected_nodes`, minus the
    affected_count which is trivially `impacted.length` and would just
    drift out of sync as a separate field).
  - **`EdgeLike` uses the same `{ source: string; target: string }`
    minimum-surface constraint `computeDependencyLists` uses.** So any
    caller who already narrowed their edge shape enough for that
    helper needs no further widening to call this one. Generic `<E>`
    preserved so the input array type isn't lost through the call.
  - **No node-metadata enrichment.** The plan bullet says "impacted
    node ids + depth" — literally that, not "impacted node ids + depth
    + name + type + health". A caller who needs to render the
    impacted nodes' names/health looks them up in the same nodes[]
    array they already have; putting that join here would duplicate
    `Architecture.nodes` shape assumptions and mean this helper knows
    about `GraphNode`, when it currently only knows about `EdgeLike`.
    Same reasoning `computeDependencyLists` used for returning just
    string[] instead of GraphNode[].
- No mutating route is wired to call this yet — Phase 3's analyze route
  and Phase 4's shadow-run compare are the first two consumers. The
  helper is a passive dependency until then, same as the five Phase 0
  models.
- Verified: `npx tsc --noEmit` clean, `npx eslint src/lib/graph/blastRadius.ts`
  clean, `npx next build` clean (all 22 existing routes still register;
  no new routes added by this task — the helper is not itself a route).
  The deprecated-`middleware` warning remains the documented pre-existing
  noise.

**2026-08-29 — Phase 0 cont.: `logActivity()` helper (Claude)**
- Next unchecked task in Phase 0 was `src/lib/logging/activity.ts` — the
  single entry point every mutating API route added by Phases 1–8 must call
  to append an `ActivityLog` row. The plan asks specifically that the actor
  be resolved via `getCurrentMembership()` so the row records who
  *actually* took the action (keyed off the authenticated Clerk session),
  not whatever the caller-provided body claimed.
- **`src/lib/logging/activity.ts`** — one exported function `logActivity()`
  with input `{ action, targetType, targetId?, metadata?, department?,
  actor? }`. Flow: resolve actor (use `input.actor` if the caller already
  got a membership from `requireRole()` / `requirePermission()` /
  `requireActiveMembership()`, else call `getCurrentMembership()`),
  `dbConnect()`, `ActivityLog.create({...})`. Returns the created doc so
  callers can reference `_id` if they need to (Phase 5 Replay's outcome-
  logging flow is the one place that will).
- **Deliberate design decisions a future agent might otherwise "correct":**
  - **Missing-actor throws, not silently no-ops.** Reaching `logActivity()`
    without an authenticated session means either the caller forgot to gate
    the route (real bug), or the session expired between the RBAC gate and
    the log write (edge case). Either way the write must not silently
    succeed with a null actor — that row would render as a ghost on the
    Phase 5 /logs page. The alternative — writing with `actorId: null` —
    was rejected because ActivityLog.ts already has `actorId` as `required:
    true` for exactly this reason (a log row without an actor is
    unreadable), and would have needed a schema change to accommodate.
  - **Errors propagate; the helper does not swallow.** A failed audit-log
    write is a real problem (a lost row makes /logs lie about history), so
    the caller decides whether to try/catch or 500 the request. Swallowing
    would have been the friendlier default (mutation succeeded, why fail
    the response?) but it would also have made silently-broken logging the
    normal state. Mongoose's own validation/connection errors surface
    verbatim; the caller can wrap in try/catch if the specific mutation
    should proceed regardless (Phase 4's shadow-run start might reasonably
    do this — the compare already ran, discarding it for a log failure is
    worse than losing the row).
  - **`actor` is an optional caller-provided override, not a required
    argument.** Most callers will already have an `ActiveMembership` in
    hand from their upstream `requireRole()` / `requirePermission()`
    check; passing it here skips a second Clerk + Mongo round-trip
    (`ensureMembership()` is idempotent but not free — it re-reads the
    Clerk user via `currentUser()` and Mongo's Membership doc every call).
    Optional rather than required because a route that only ever calls
    `requireActiveMembership()` from a server component (no local
    membership variable in scope by the time it wants to log) can just
    call `logActivity({ action, targetType })` and let the helper resolve
    the actor itself. Same pattern any well-behaved auth helper uses.
  - **`department` default is the actor's department; override is a
    tri-state (`undefined` = inherit, `Department` = override, `null` =
    org-wide).** The default matches what ActivityLog.ts's file comment
    already said the helper would do ("copy that membership's department
    onto the row"). Override exists because a cross-department action
    (ADMIN-dept user approving a member for NETWORK_ENGINEERING) should
    record the affected department on the row so those admins see it in
    their scoped /logs view, not the actor's ADMIN scope which nobody
    else can filter for. Explicit `null` for org-wide events is
    distinguishable from an omitted field because JS's `input.department
    === undefined` check draws the line cleanly — using a truthy check
    (`input.department ??`) would have collapsed "explicit null" and
    "omitted" into the same case, which is a real bug when the caller
    means "this is org-wide, not my dept". Same tri-state pattern
    Mongoose itself uses for `default: null` versus an unset path.
  - **`new Types.ObjectId(actor.userId)` explicit cast, not string-passed.**
    Mongoose does auto-cast valid ObjectId strings for schema fields typed
    `Schema.Types.ObjectId`, but the explicit constructor call throws a
    clear `BSONError` immediately at the write site if `actor.userId` is
    somehow malformed (e.g. a caller passed a fake ActiveMembership in a
    test), rather than letting Mongoose surface a less clear cast error
    later. Consistent with how `Membership.userId` and `Architecture
    .ownerId` are already `ObjectId` refs to User.
  - **Return type is `Promise<ActivityLogDoc>`, not `void`.** Fire-and-
    forget callers can ignore the return; Phase 5 Replay's outcome-
    logging flow will want the created row's `_id` to link it back to
    the corresponding SimulationRun / ShadowRun via a subsequent update.
    Returning the doc costs nothing (the create already returned it) and
    saves a follow-up query.
  - **No re-export of `ActivityLog` / `ActivityLogDoc` from this module.**
    They're still imported from `@/lib/models/ActivityLog` — the plan's
    convention (see `models/*` vs `lib/*` split) is that models live in
    `lib/models/` and are imported directly wherever needed. This helper
    is the *write* path only; readers (Phase 5's /logs page, Phase 4's
    architecture-scoped run-history tab) query the model directly.
- No mutating route is wired to call this yet — that starts happening in
  Phase 1 (`remediation.execute`) and Phase 2 (`architecture.*`). The
  helper is a passive dependency until then, same as the five models it
  writes through.
- Verified: `npx tsc --noEmit` clean, `npx eslint src/lib/logging/activity.ts`
  clean, `npx next build` clean (all 22 existing routes still register; no
  new routes added by this task — the helper is not itself a route). The
  deprecated-`middleware` warning remains the documented pre-existing noise.

**2026-08-29 — Phase 0 cont.: `NodeBusinessMeta` model (Claude)**
- Next unchecked task in Phase 0 was the `NodeBusinessMeta` Mongoose model
  — the business-side facts (revenue/hour, SLA tier, business processes,
  criticality) Phase 3's simulation results turn into money figures and
  Phase 6's CAB Copilot renders the revenue-exposure chart from. Built to
  match the four existing Phase 0 models exactly (hot-reload guard
  `models.NodeBusinessMeta ?? model(...)`, `InferSchemaType`-derived
  `NodeBusinessMetaDoc`, enums re-exported from a mongoose-free constants
  file, `{ timestamps: true }`).
- **`src/lib/models/NodeBusinessMeta.ts`** — fields per plan bullet
  exactly: `nodeKey` (String, `required`, `unique`, indexed — the graph
  identifier as it appears on `GraphNode.id` and on an Architecture's
  `nodes[].id`; one row per node key so the same physical node in both
  the live fleet and a saved architecture shares a single row),
  `revenuePerHour` (Number, `min: 0`, default 0 — the wall-clock money
  attached to an hour of downtime; Phase 3's blast-radius × downtime
  helper multiplies this in), `slaTier` (enum, indexed, default
  `'bronze'`), `businessProcesses` (`[String]`, indexed, default `[]`),
  `criticality` (enum, indexed, default `'medium'`).
- **`src/lib/nodeBusinessMeta/constants.ts`** — new mongoose-free enum
  file exporting `SLA_TIERS = ['platinum', 'gold', 'silver', 'bronze']`
  (standard four-tier industry ordering, highest commitment first — the
  numeric target each tier maps to is a business decision the Phase 3
  editor exposes, so retuning targets later doesn't touch the schema)
  and `CRITICALITY_LEVELS = ['critical', 'high', 'medium', 'low']`
  (business importance, not runtime health — the four labels match the
  severity axis already used in `mockBusinessProcess.severity` and in
  `NodeInspector`'s alert-severity badges so the same colour tokens can
  be reused when the Phase 3 editor renders these). Same pattern as
  `src/lib/architecture/constants.ts`, `src/lib/simulation/constants.ts`
  and `src/lib/shadowRun/constants.ts`.
- **Deliberate deviations a future agent might otherwise "correct":**
  - **`nodeKey` is String, not ObjectId, and is `unique`.** The plan
    bullet says `nodeKey`, not `nodeId`, on purpose: this key is the
    graph node identifier (`srv-db-03`, `app-lims`, or a FastAPI
    node_id UUID — same shape as SimulationRun's `targetNodeId`), never
    a Mongo `_id`. `unique` because one physical node → one business
    meta row is the intended cardinality; the Phase 3 editor upserts
    by nodeKey rather than creating duplicates. `unique` implies an
    index, but the explicit `index: true` is kept for symmetry with
    every other filterable field in this repo's models.
  - **`businessProcesses` is `[String]`, not references to a
    BusinessProcess model.** No BusinessProcess model exists yet, and
    the set of processes the org tracks is open-ended (see
    `mockBusinessProcess` for the current hand-authored list — Sample
    Batch Release, Instrument Qualification, etc). Storing the process
    name inline lets the Phase 3 editor add a new process by typing it,
    and Phase 6 can group nodes by process without a join. Same
    "open-ended by design" reasoning ActivityLog's `action` field gave.
    An index on `[String]` is a multikey index — Mongo indexes each
    array element separately — which is what Phase 6's "which nodes
    feed process X" reverse-lookup wants.
  - **`revenuePerHour` has `min: 0` but no `max`.** Money figures at
    Waters-scale are unbounded on the upside; a hard cap here would
    just be an arbitrary trap. `min: 0` because negative revenue is
    always a data-entry mistake — the Phase 3 editor should refuse
    negatives at the form level too, but the DB backstop matches how
    SimulationRun's `riskScore` has `min: 0` as a floor.
  - **`slaTier` defaults to `'bronze'`, `criticality` to `'medium'`.**
    Both are the least-scary sensible default so a partially-filled
    row (Phase 3's editor may let you save with just `nodeKey` +
    `revenuePerHour`) doesn't inadvertently project the node as
    top-tier critical infrastructure. Consistent with how
    ShadowRun defaults `status: 'pending'` — a doc must always be in
    a legal enum value, never null-into-a-required-field.
  - **No `department` field.** Unlike Architecture / ActivityLog which
    scope by department for the /logs page and library page, business
    meta is a fact about the node itself — it doesn't move when the
    node is reassigned to a different team, and Phase 6's revenue-
    exposure chart wants to sum across departments. If dept-scoping
    ever becomes necessary (e.g. an ops team can only see their own
    nodes' revenue) it can be derived by joining `nodeKey` back to
    whichever graph source assigns nodes to departments — same
    reasoning ShadowRun gave for not duplicating ownerClerkId.
  - **No `ownerId` / `runBy` field.** Business meta is org-wide facts,
    not per-actor records; Phase 3's editor writes via the
    `logActivity()` helper (still to be built — very next Phase 0
    task) so the "who last edited this" audit trail lives in
    ActivityLog, not on the row. Same reasoning ShadowRun gave for
    skipping `runBy`.
- **Indexes.** Every lookup Phase 3 + Phase 6 will run is index-backed
  from day one: `nodeKey` (upsert-by-key from the editor, join from a
  blast-radius node id — the hottest path), `slaTier` (Phase 6 groups
  revenue exposure by tier), `businessProcesses` (multikey — the
  reverse "which nodes feed this process" lookup), `criticality`
  (Phase 3 discounts blast-radius money by criticality; Phase 6 wants
  to render "critical exposure" separately), plus the automatic
  `createdAt`/`updatedAt` from `timestamps: true` so an "edited most
  recently" audit view is possible without a scan.
- No `logActivity()` call inside the model itself — that helper still
  doesn't exist (very next Phase 0 task, per the plan order). The
  model is a passive dependency until Phase 3's editor route wires
  the upsert and logs it.
- Verified: `npx tsc --noEmit` clean, `npx eslint
  src/lib/models/NodeBusinessMeta.ts
  src/lib/nodeBusinessMeta/constants.ts` clean, `npx next build`
  clean (all 22 existing routes still register; no new routes added
  by this task — the model is a passive dependency until Phase 3
  wires the business-metadata editor and Phase 6 reads it into the
  revenue-exposure chart). Deprecated-`middleware` warning remains
  the documented pre-existing noise.

**2026-08-29 — Phase 0 cont.: `ActivityLog` model (Claude)**
- Next unchecked task in Phase 0 was the `ActivityLog` Mongoose model — the
  append-only history the Phase 5 `/logs` page reads from (filter by
  actor / action / date / department, per the plan) and that every mutating
  route added by Phases 1–8 must write to via the still-to-be-built
  `src/lib/logging/activity.ts` helper (the very next Phase 0 task).
- **`src/lib/models/ActivityLog.ts`** — same hot-reload guard as the three
  earlier Phase 0 models (`models.ActivityLog ?? model(...)`), same
  `InferSchemaType`-derived `ActivityLogDoc`, same `{ timestamps: true }`
  (createdAt is the log's timestamp). Fields per plan:
  `actorId` (`ObjectId → User`, required, indexed — for the /logs page's
  "filter by actor" facet), `actorEmail` (String, required, indexed —
  denormalized so a log row stays readable after the actor's User doc is
  deleted or revoked; history mustn't lose meaning when its subject leaves),
  `action` (String, required, indexed), `targetType` (String, required,
  indexed — collection name that was mutated), `targetId` (String, nullable,
  indexed), `metadata` (`Mixed`, nullable), `department` (`String` with
  `enum: DEPARTMENTS`, nullable, indexed).
- **Deliberate deviations a future agent might otherwise "correct":**
  - **`action` and `targetType` are plain `String`, not enums.** The other
    three Phase 0 models each carry a tight closed-domain enum
    (SIMULATION_TYPES, SHADOW_RUN_STATUSES, ARCHITECTURE_VISIBILITIES).
    Actions are the opposite — the set grows every time a new mutating
    route is added (Phase 1 remediation.execute, Phase 2 architecture.*,
    Phase 3 simulation.analyze, Phase 4 shadow_run.start, Phase 8
    node_work.execute, plus retrofits of the admin routes). Locking those
    into a mongoose enum would mean a model change per new action; a
    naming convention (`entity.verb`) captured in the file comment is
    enough. targetType (= Mongoose model name) has the same open-set
    property. No new constants file was created for this reason — nothing
    to re-export. `DEPARTMENTS` for the `department` field was re-exported
    from the model, mirroring how `Membership.ts` re-exports from
    `lib/auth/constants.ts`.
  - **`targetId` is String, not ObjectId.** Some targets are Mongo `_id`s
    (Architecture, SimulationRun, ShadowRun, Membership); others are
    foreign keys (node key from FastAPI's Postgres, Clerk invitation id
    like `inv_...`). One String field means one uniform target type — the
    caller stringifies its ObjectId — instead of a discriminator or a
    per-type second field.
  - **`targetId` is nullable.** Some events (a bulk operation, a session
    event, a general admin action) don't point at exactly one document.
  - **`metadata` is `Mixed`, default `null`.** Same reasoning the other
    Phase 0 models gave for `Mixed` fields: the shape depends on the
    action (share carries recipient ids, analyze carries riskScore + blast
    radius size, remediation carries the runbook step list), and forcing
    each into a per-action subdocument would just mean a migration every
    new phase. Round-trips as JSON exactly like Architecture's
    nodes/edges, SimulationRun's blastRadius/resultJson, and ShadowRun's
    snapshots.
  - **`department` is nullable.** Consistent with `Membership.department`
    (a still-pending user has no dept) and lets a cross-department admin
    action (org-level operations, bootstrap) skip picking a scope it
    doesn't have. The /logs page's "filter by department" facet will
    treat null as "org-wide".
  - **No `department` re-derivation from actor.** The `logActivity()`
    helper (next Phase 0 task) will resolve actor via
    `getCurrentMembership()` and copy that membership's department onto
    the row — this is why the field is stored inline instead of joined
    at read time: a user's department can change (admin reassignment)
    and the log must record the department at the time of the action,
    not the current one. Same denormalization reason as `actorEmail`.
- **Indexes.** Every filter the Phase 5 /logs page runs is index-backed
  from day one: `actorId` (filter by actor), `actorEmail` (search by
  email substring — same pattern the admin/members search uses), `action`
  (filter by action), `targetType` + `targetId` (all rows for a given
  Architecture / SimulationRun / etc — the "history for this
  architecture" view Phase 2/4 will link to), `department` (dept-scoped
  logs for non-org-admins), and the automatic `createdAt` from
  `timestamps: true` (date-range filter).
- No `logActivity()` call inside the model itself — that helper doesn't
  exist yet (the very next Phase 0 task). The model is a passive
  dependency until then.
- Verified: `npx tsc --noEmit` clean, `npx eslint src/lib/models/ActivityLog.ts`
  clean, `npx next build` clean (all 22 existing routes still register;
  no new routes added by this task — the model is a passive dependency
  until Phase 1's remediation route and Phase 2's architecture routes
  start writing rows to it). Deprecated-`middleware` warning remains the
  documented pre-existing noise.

**2026-08-29 — Phase 0 cont.: `ShadowRun` model (Claude)**
- Next unchecked task in Phase 0 was the `ShadowRun` Mongoose model — the
  row Phase 4's shadow-run route will persist (one per compare, so its
  results survive the page reload and the divergence meter has real
  numbers behind it), and that Phase 5's Replay page will read alongside
  `SimulationRun` + `Architecture`. Built to the same shape as the two
  models already in place (hot-reload guard `models.ShadowRun ?? model(...)`,
  `InferSchemaType`-derived `ShadowRunDoc`, enums re-exported for callers,
  `{ timestamps: true }`).
- **`src/lib/models/ShadowRun.ts`** — fields per the plan bullet exactly:
  `architectureId` (`ObjectId → Architecture`, indexed — the saved
  architecture Phase 2 will load into the sim side), `liveSnapshot`
  (`Mixed`, default `null`), `simSnapshot` (`Mixed`, default `null`),
  `divergence` (0–100 with min/max — same shape the existing
  hardcoded `divergencePercent = 34` at `shadow-run/page.tsx:26` renders),
  `metrics` (`Mixed`, default `null` — the roll-up shape the current
  `SimulatedMetrics` interface in `services/shadowRun.service.ts` uses:
  cpuDelta / latencyDelta / projectedDowntime / revenueAtRisk, plus
  whatever Phase 4's divergence helper decides to add),
  `status` (enum, indexed, default `'pending'`, `required` so a doc can
  never sit in an undefined state — Phase 4's route flips it through
  running → completed / failed).
- **`src/lib/shadowRun/constants.ts`** — new mongoose-free enum file
  `SHADOW_RUN_STATUSES = ['pending', 'running', 'completed', 'failed']`.
  Same pattern as `src/lib/simulation/constants.ts` and
  `src/lib/architecture/constants.ts`. The shadow-run page and the
  eventual architecture-scoped run-history tab can import these
  without dragging mongoose into the browser bundle.
- Deliberate deviations from Architecture / SimulationRun that a future
  agent might otherwise "correct" into being:
  - **No `runBy`.** SimulationRun has one; the Phase 0 bullet for
    ShadowRun explicitly does not list it, and Phase 5 says the Logs
    page reads from `ActivityLog` (still to be built later in Phase 0),
    not by joining a `runBy` back onto each shadow run. The activity
    log will carry the actor. Keeping it off means one less index to
    maintain on a doc that scopes purely by `architectureId`.
  - **No `ownerClerkId` mirror.** ShadowRun always scopes through
    `architectureId`, which is already ownership-scoped (the Architecture
    row carries `ownerId` + `ownerClerkId` + `visibility` + `sharedWith`),
    so duplicating a Clerk id here would just be dead index weight —
    same reasoning `SimulationRun.ts` gave for skipping `runByClerkId`.
- `liveSnapshot` / `simSnapshot` / `metrics` deliberately stored as
  `Mixed`: the shapes are whatever the still-unbuilt Phase 4 divergence
  helper hands back — nodes-with-health on both sides plus per-node
  metrics, potentially with blast-radius overlays as Phase 4 grows.
  Duplicating those into a strict subdocument schema would just mean
  maintaining two definitions of the same shape and blocking any future
  field addition on a schema migration. Same reasoning as
  Architecture's nodes/edges and SimulationRun's blastRadius/resultJson.
- No `logActivity()` calls in the model itself — that helper still
  doesn't exist (later Phase 0 task); Phase 4's mutating route will
  call it.
- Verified: `npx tsc --noEmit` clean, `npx eslint` clean on both new
  files, `npx next build` clean (all 22 existing routes still register;
  no new routes added by this task — the model is a passive dependency
  until Phase 4 wires the shadow-run compare API around it).
  Deprecated-`middleware` warning remains the documented pre-existing
  noise.

**2026-08-29 — Phase 0 cont.: `SimulationRun` model (Claude)**
- Next unchecked task in Phase 0 was the `SimulationRun` Mongoose model — the
  history row that Phase 3's `/api/simulation/analyze` will persist and that
  Phase 5's Replay page will read from. Built to match the `Architecture.ts`
  shape exactly (hot-reload guard `models.SimulationRun ?? model(...)`,
  `InferSchemaType`-derived `SimulationRunDoc`, enums re-exported for callers,
  `{ timestamps: true }`).
- **`src/lib/models/SimulationRun.ts`** — fields per plan:
  `architectureId` (`ObjectId → Architecture`, indexed), `targetNodeId`
  (indexed String — the node key in the architecture graph, not a Mongo id),
  `simulationType` (enum, indexed), `blastRadius[]` (`Mixed[]`, default `[]`),
  `riskScore` (0–100 with min/max), `projectedDowntime` (Number),
  `resultJson` (`Mixed`), `backendSimId` (nullable indexed String — the
  FastAPI Postgres UUID when the target also existed in the live fleet),
  `runBy` (`ObjectId → User`, indexed).
- **`src/lib/simulation/constants.ts`** — new mongoose-free enum file
  `SIMULATION_TYPES` = the five FastAPI `simulation_engine` values
  (`cpu_spike`, `memory_leak`, `disk_full`, `network_storm`, `node_failure`)
  plus `scenario_analysis` for frontend-only what-if runs where the
  architecture has no live counterpart. Same pattern as
  `src/lib/architecture/constants.ts`. This is what makes a run mirrored
  straight from `POST /simulation/run` land in the same collection as a
  purely-derived analysis without translation.
- Deliberate deviation from the Architecture model: **no** `runByClerkId`
  duplicate of `runBy`. Architecture stores both because scoping queries
  key off Clerk id via `getCurrentMembership()`; SimulationRun history is
  scoped by `architectureId` (which is already ownership-scoped) or by
  `targetNodeId`, never by actor Clerk id, so the extra field would just
  be dead index weight.
- `blastRadius` / `resultJson` deliberately stored as `Mixed`: the blast
  radius shape is whatever the still-unbuilt `src/lib/graph/blastRadius.ts`
  helper will return (per the plan: impacted node ids + depth — richer
  than a flat `String[]`, and might grow), and `resultJson` is whatever
  FastAPI ships back verbatim. Same reasoning as Architecture's nodes/edges.
- No `logActivity()` calls in the model itself — that helper still doesn't
  exist (later Phase 0 task); Phase 3's mutating route will call it.
- Verified: `npx tsc --noEmit` clean, `npx eslint` clean on both new files,
  `npx next build` clean (all 22 existing routes still register; no new
  routes added by this task — the model is a passive dependency until
  Phase 3 wires the analyze API around it). Deprecated-`middleware`
  warning remains the documented pre-existing noise.

**2026-08-29 — Phase 0 kickoff: `Architecture` model (Claude)**
- First unchecked task in Phase 0 was the `Architecture` Mongoose model — the
  save/load target for Scenario Builder in Phase 2 and the graph that
  SimulationRun/ShadowRun will reference in Phases 3–4. Built it end-to-end.
- **`src/lib/models/Architecture.ts`** — follows the exact
  [Membership.ts](src/lib/models/Membership.ts) shape (hot-reload guard
  `models.Architecture ?? model(...)`, `InferSchemaType`-derived `ArchitectureDoc`,
  enums re-exported for callers). Fields: `name`, `description`,
  `ownerId` (`ObjectId → User`) + `ownerClerkId` (indexed string, matches how
  `getCurrentMembership()` already keys off Clerk ids), `nodes[]`, `edges[]`,
  `department` (enum from `DEPARTMENTS`, nullable — a personal architecture has
  no department), `visibility` (`private | department | shared`, default
  `private`), `sharedWith[]` (`ObjectId → User`), `version` (int, default 1),
  and `{ timestamps: true }` for `createdAt`/`updatedAt`.
- Nodes/edges stored as `Schema.Types.Mixed` on purpose: the on-disk shape is
  exactly whatever `GraphNode`/`GraphEdge` (`src/types/graph.ts`) already carry,
  and the canvas round-trips them as JSON. Duplicating those fields into a
  strict subdocument schema would just mean maintaining two definitions of the
  same shape and blocking any future field addition on a schema migration.
- **`src/lib/architecture/constants.ts`** — new mongoose-free enum file for
  `ARCHITECTURE_VISIBILITIES` / `ArchitectureVisibility`, mirroring
  [lib/auth/constants.ts](src/lib/auth/constants.ts). Necessary so the Phase 2
  share-modal / library page can `import { ARCHITECTURE_VISIBILITIES }` on the
  client without dragging mongoose into the browser bundle.
- Indexes on `name`, `ownerId`, `ownerClerkId`, `department`, `visibility`,
  `sharedWith` — every filter Phase 2's `/api/architectures` GET will run
  (scope by owner OR by department match OR by sharedWith-contains-me) is
  index-backed from day one.
- No `logActivity()` calls yet — the logger doesn't exist until later in
  Phase 0. Mutating routes added in Phase 2 will be responsible for logging;
  the model itself has no reason to.
- Verified: `npx tsc --noEmit` clean, `npx eslint src/lib/models/Architecture.ts
  src/lib/architecture/constants.ts` clean, `npx next build` clean (all 22
  existing routes still register; the deprecated-`middleware` warning is the
  documented pre-existing noise). No new routes added by this task — the
  model is a passive dependency until Phase 2 wires the API around it.



**Architectural Overhaul COMPLETE ✅**
- Navbar redesigned to enforce strict Digital Twin vs Simulation Lab split.
- Graph decoupled from hardcoded components, running entirely off dynamic Waters infra mock.
- ALL target routes built out to spec. Front-end is feature complete.

**2026-08-27 — Interactive Digital Twin: node-type icons + type-specific panels (Claude)**
- Goal: make the dependency graph the visual centerpiece of `/digital-twin`, give every node
  type its own icon, and make clicking a node show a mini-dashboard specific to *that* kind of
  component. Extended the existing `@xyflow/react` graph (did not switch to the legacy `reactflow`
  package the task brief suggested as a fallback — `@xyflow/react` is its current successor and
  was already used throughout, including in the Scenario Builder's editable canvas; installing
  both would've meant two React Flow copies in the bundle for no benefit). Added `dagre` for the
  new re-layout button.
- **Node type taxonomy** (`src/lib/graph/nodeTypes.ts`): `nodeTypeConfig` maps every `NodeType` to
  an icon/color/label, grouped around the 8 Waters-stack categories from the brief (Server,
  Database, Application, Network Device, Directory/Auth, Virtualization Host, Storage, Monitoring
  Source). Rather than replacing the existing generic `NodeType` union (`server`, `vm`,
  `switch`, `firewall`, `loadbalancer`, `device`, `cloud`, `container`, `infrastructure` —
  referenced by `ConnectNodeModal`, the live FastAPI adapter, and the scenario builder), added
  `network_device` / `directory_auth` / `virtualization_host` / `monitoring_source` alongside them
  in `types/graph.ts`, with the older generic types mapped onto whichever new category they're
  closest to (e.g. `switch`/`device`/`loadbalancer` → Network Device styling) so nothing existing
  broke. `NODE_TYPE_CATEGORIES` de-dupes this for the filter bar/legend so it doesn't show
  visually-identical chips twice.
- **`GraphNode.tsx`** (replaces `CustomNode.tsx`, the only place that imported it): icon-in-a-ring
  badge (color from nodeTypeConfig) + independent health-status dot + incident badge + hover
  tooltip (name/type/health, no backend call) + blast-radius-style focus — selecting a node scales
  it up and glows it and its direct neighbors, dims everything else via new `isDimmed`/`isNeighbor`
  flags `FlowCanvas` computes from the edge list.
- **Real bug fixed while wiring selection-driven dimming**: `FlowCanvas` only ever passed
  `onNodesChange` to `<ReactFlow>` when `readOnly={false}`. The digital-twin page always renders
  read-only, so react-flow's internal selection state changes on click were silently discarded —
  the old `CustomNode`'s `selected` prop could never actually become `true` there, dead code in
  practice. Fixed by driving selection explicitly instead of relying on react-flow's internal
  state: the parent page's `selectedNodeId` is now stamped onto each node object's own `selected`
  field in `toFlowNode()`. Also means dragging nodes to rearrange them (explicitly requested — "Drag
  nodes → reposition freely") now works in read-only mode too, since `onNodesChange` is always
  wired; a wrapper filters out only `'remove'` changes when `readOnly` so topology edits still stay
  blocked. Positions are preserved across data refreshes via a `positionById` map so a live
  WS update doesn't snap dragged nodes back.
- **Re-layout**: `lib/graph/layout.ts` wraps `dagre` for a one-click hierarchical reset (button
  shown via `FlowCanvas`'s new `showRelayoutButton` prop) — needed `ReactFlowProvider` added around
  `FlowCanvas`'s contents (split into `FlowCanvasInner`) since `fitView()` requires the hook context.
- **Edge click**: clicking an edge shows a small popover (source → target, relationship type,
  latency) — the "nice-to-have" from the brief.
- **Search/filter bar** (`GraphFilterBar.tsx`): text search + node-type chip toggles (reusing the
  same icons) + department chip toggles, all filtering client-side in `digital-twin/page.tsx`
  (nodes AND edges — an edge only survives if both endpoints do). A new `GET /api/me` route feeds
  a "Viewing as: DEPARTMENT · ROLE" indicator from the RBAC layer built two sessions ago. This is
  **not** the server-side department scoping §8 of the team/roles task asked for and I flagged as
  unresolved then — it still isn't resolved now, just made visible/usable client-side. Real nodes
  from the live FastAPI backend have no `department` field at all (only mock data does, see below),
  so the department filter currently only does anything useful against mock data.
- **Type-specific panels** (`components/graph/panels/`, 8 components + a shared `PanelStat`/
  `PanelGauge`/`SimulateButton`): `NodeInspector.tsx` now renders a shared base section (name, type
  + icon, health badge, region, last-updated) followed immediately by the type-specific panel
  (`getNodeTypePanel(node.type)`), with the pre-existing generic content (trend sparkline,
  utilization bars, dependencies, alerts, remediation actions, credentials) kept below since it's
  still real/useful data. Which panel fields are real vs. mocked (**flagging per the checklist**):
  - **Server** — CPU/Mem/Disk real when live (NodeHealth), uptime real; OS/patch-level **mocked**.
  - **Database** — everything **mocked** (pool usage, query count, replication, backup) — backend
    has no DB-internals endpoint.
  - **Application** — downstream dependent count is **real** (graph edges); version/last-deploy
    **mocked**; health-check history reuses the real shared trend sparkline below it (not
    duplicated in-panel).
  - **Network Device** — connected-device count **real** (graph edges); bandwidth/latency/packet
    loss **mocked**.
  - **Directory/Auth** — dependent-app count and last-sync **real**; account count/auth-failure
    count **mocked**.
  - **Virtualization Host** — hosted-workload list **real** (this host's outgoing edges, clickable
    → jumps the inspector to that node via new `onSelectNode`); VM count/resource allocation
    **mocked**.
  - **Storage** — everything **mocked** (no storage/IOPS/backup-job endpoint).
  - **Monitoring Source** — last-sync **real**; active-alert count **real** when per-node alert
    data is loaded, else 0; source-system name is a guess from the node label.
  Each "Simulate: …" action button (Server load-spike, Database migration, Network AP
  repositioning) calls the real (mock-backed) `simulationService.analyzeScenario()` with a
  node-specific prompt and shows its summary inline, rather than being inert.
- **Mock data** (`mockGraph.ts`) retyped to match the brief's example table exactly (Empower/
  NuGenesis/Citrix/IIS/Wildfly/Tomcat → `application`; Oracle-* → `database`; RawDataServer →
  `server`; UNIFI/LACENodes/LNDDevices → `network_device`; ActiveDirectory → `directory_auth`;
  VMware → `virtualization_host`) and given a `department` tag per node. Added two nodes
  (`SAN-Storage01`, `SolarWinds Feed`) that didn't exist before so Storage and Monitoring Source
  actually have a panel to demo — per the checklist's instruction not to build panels for types
  with zero seeded nodes, and this makes that true for mock data; the **live backend still can't
  produce `directory_auth`/`virtualization_host`/`network_device`/`storage`/`monitoring_source`
  nodes at all** (its `node_type` enum only has 9 generic values — see `mapNodeType` in
  `backendAdapters.ts`, updated to route `monitoring` → `monitoring_source` but otherwise
  unchanged) — flagging this the same way the FastAPI-boundary gap was flagged previously: fixing
  it needs either backend enum changes or a Neo4j category tag, a decision for a human, not
  something to default into this pass.
- **Home page layout** (`digital-twin/page.tsx` rewritten): graph is now the full-width/height
  centerpiece (was a 30%-width side column before). A thin top toolbar (title, node count,
  Connect/Show-Panels buttons) plus the new filter bar sit above it; the old inline "Mission
  Control" analytics grid (health donut, alerts, at-risk list, cert tracker) moved into a
  collapsible 340px right rail (default open, toggle button collapses it to give the graph full
  width) rather than disappearing — still real content, just no longer competing with the graph
  for the dominant position. `NodeInspector`'s slide-over drawer is unchanged positionally (fixed
  overlay, `z-50`) so it overlays on top of the rail rather than squeezing the graph.
- Verified via `npx tsc --noEmit`, `npx next build` (clean, all routes including new `/api/me`
  registered), and `npx eslint` on every new/changed file (clean; the few `set-state-in-effect`
  lint errors elsewhere — `digital-twin/page.tsx`'s own initial-load effect included — are a
  pre-existing pattern already present throughout this codebase before this session, not a new
  regression). **Could not do a live browser click-through this session** — no headless-browser
  tool (`chromium-cli`/Playwright) was available in this environment, and the page sits behind
  Clerk auth. Recommend the next agent (or the user) load `/digital-twin`, click through a few
  node types, and confirm the panels/drawer render as intended before a live demo.

**2026-08-26 — Email invites + people search on the Team panel (Claude)**
- Follow-up to the team/role layer above. Two additions to `/admin/team`:
- **Invite by email**: new form (email + department + role → Send Invite) calling
  `POST /api/admin/invite-email`, which uses Clerk's Backend API (`clerkClient().invitations
  .createInvitation`) to send a real signup-invite email — no separate "pending invite" DB table
  needed. The trick: the chosen department/role are stamped onto the invitation's `publicMetadata`
  (`invitedDepartment`/`invitedRole`/`invitedByEmail`), which Clerk carries onto the resulting User
  once they accept and sign up. Pulled the "how do we decide a fresh Membership's initial state"
  logic (previously just the bootstrap-admin check, inlined in both the webhook and
  `rbac.ts`) out into `src/lib/auth/provisioning.ts`'s `resolveInitialMembershipState()`, shared by
  both `api/webhooks/clerk/route.ts` (`user.created`) and `rbac.ts`'s `ensureMembership` — it now
  checks bootstrap-admin *first*, then invite metadata, and returns PENDING otherwise. Also made
  `ensureMembership`'s existing self-heal (added earlier today for a real bug — see below) generic:
  a still-PENDING doc gets promoted to ACTIVE from either path, not just the admin-email one,
  covering the case where someone signs up before the webhook fires.
  A third table, "Invited — Awaiting Signup", lists outstanding invites via
  `GET /api/admin/invitations` (reads straight from Clerk, `status: 'pending'` — no local storage
  to go stale) with a Revoke button (`DELETE /api/admin/invitations/[id]` →
  `clerkClient().invitations.revokeInvitation`).
- **Search**: a single debounced (300ms) search box above all three tables, wired to `?q=` on
  `GET /api/admin/pending-users`, `/api/admin/members`, and `/api/admin/invitations`. The first two
  now resolve matching `User` docs by name/email regex first (added indexes on both fields in
  `lib/models/User.ts`) and restrict the `Membership` query to those ids, rather than loading every
  row and filtering client-side — meant to hold up as the org grows past what fits on one screen.
  `escapeRegex()` (`src/lib/search.ts`) sanitizes the query before it hits a Mongo regex. The
  invitations list reuses Clerk's own `query` param on `getInvitationList` instead of a local
  index, since Clerk is already the source of truth there.
- **Real bug found and fixed while testing the bootstrap-admin flow**: adding this account's email
  to `ADMIN_EMAILS` *after* it had already signed up (and gotten a PENDING Membership doc) didn't
  do anything — `ensureMembership` only ever evaluated the bootstrap rule at doc-creation time, so
  an existing PENDING doc was stuck regardless of later `ADMIN_EMAILS` edits. Fixed by having
  `ensureMembership` re-run `resolveInitialMembershipState()` against an existing PENDING doc on
  every call and self-heal it to ACTIVE the moment it resolves non-PENDING — no manual Mongo edit
  needed to unstick a waiting admin.
- Verified with `npx tsc --noEmit` and `npx next build` (clean; both new routes and the invite
  route registered:  `/api/admin/invite-email`, `/api/admin/invitations`, `/api/admin/invitations/[id]`).
  Live-sending an actual invite email needs `CLERK_WEBHOOK_SECRET` configured in the Clerk
  dashboard for the *other* half (webhook sync) to fire — untested end-to-end in this session since
  that secret is still blank locally; the lazy `ensureMembership` self-heal path covers login even
  without it, same as it always has for the bootstrap-admin case.

**2026-08-22 — Backend wiring pass (Claude)**
- Fixed real pre-existing TypeScript breakage: `types/graph.ts`'s `GraphNode`/`GraphEdge`/`LiveGraphData`
  had drifted from how the app actually uses them (CustomNode/FlowCanvas/mockGraph wanted
  `dependencyCount` + no `totalNodes`/`liveStatus`; NodeInspector wanted `dependencies`/`dependents`
  arrays too — both are now present together). `SimulationPlan` was missing the
  `nodesAdded`/`nodesRemoved`/`edgesAdded`/`edgesRemoved`/`status` fields scenario-builder and
  mockScenario.ts actually construct. `mockScenario.ts` imported `mockNodes`/`mockEdges` that
  didn't exist. Full list of ~30 tsc errors, all now clean (`npx tsc --noEmit` passes, `next build`
  succeeds).
- **Live-wired against the real FastAPI backend** (repo: `../InfraMind.py`), via `src/lib/backendAdapters.ts`:
  - `graphService.getLiveGraph()` → `GET /fleet/graph` (Neo4j topology)
  - `nodeHealthService.getSummary()` → `GET /fleet/summary` + `/nodes` (health-score bucketing computed
    client-side since the backend's summary buckets by operational status, not health score)
  - `nodeHealthService.getNodes()/getNode()` → `GET /nodes` + per-node `GET /nodes/{id}/metrics` (also
    yields the 24h trend sparkline and a real network-throughput rate from the delta between the two
    most recent samples) + `GET /nodes/{id}/alerts`
  - Digital Twin page now subscribes to `WS /ws` (`node.status_changed`, `node.registered`) for live
    updates instead of only refreshing on load.
  - Found and fixed a backend bug along the way: `agents.py`'s heartbeat handler compared
    `effective_status != node.status` *after* already having set `node.status = effective_status`,
    so `node.status_changed` never actually broadcast. Fixed in `InfraMind.py/backend/routers/agents.py`.
- **Still mock-only, by design, not oversight:** everything under Simulation Lab except the graph
  canvas itself (NL scenario building, model accuracy/drift, remediation actions, business-process
  impact, shadow-run, replay history, CAB co-pilot chat/revenue) — the backend has no endpoints for
  any of these yet (see the original API Plugin Map above; none of those paths exist on the FastAPI
  side). `USE_MOCK` still exists as a global escape hatch to force everything to mock, e.g. for an
  offline demo.
- Env template added: `.env.local.example` (`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_WS_URL`,
  `NEXT_PUBLIC_API_TOKEN` — must match the backend's `API_SECRET_KEY`, `NEXT_PUBLIC_USE_MOCK`).

**2026-08-23 — Switched AI Copilot from Claude to Gemini (Claude, ironically)**
- User doesn't want Anthropic — wants a free Gemini API key instead. Swapped `@anthropic-ai/sdk` for
  `@google/genai` (`npm uninstall @anthropic-ai/sdk && npm install @google/genai`) and rewrote
  `src/app/api/nl/route.ts` to call Gemini's Interactions API (`ai.interactions.create`, current as
  of this SDK version — the older `generateContent`/`GoogleGenerativeAI` pattern is superseded) on
  model `gemini-3.7-flash`. Structured output uses `response_format: {type:'text',
  mime_type:'application/json', schema}` where `schema` is generated straight from the same Zod
  schema (`z.toJSONSchema(GraphEditSchema)`) used to validate the parsed response — one schema,
  not two hand-kept-in-sync copies. Verified every field name (`interactions`, `output_text`,
  `status`, `errors`, `response_format.schema`) against the actual installed
  `node_modules/@google/genai` `.d.ts` files rather than trusting docs/training-data recall, since
  this SDK has moved fast; `tsc` passed clean on the first try against those types.
- Env var renamed `ANTHROPIC_API_KEY` → `GEMINI_API_KEY` (`.env.local.example`, still no
  `NEXT_PUBLIC_` prefix — server-side only). Free key: https://aistudio.google.com/apikey.
- Live-tested end-to-end against the user's own key (already in their `.env.local`): a bare
  "add a redis cache" prompt correctly produced a `database`-type node in the `data` layer, and a
  migration prompt against a real 2-node/1-edge canvas correctly referenced the *actual* existing
  ids for removal (`nodesRemoved:["db-01"]`, `edgesRemoved:["e1"]`) and rewired the surviving edge
  to the new node rather than leaving it dangling — the defensive "only remove ids that were
  actually on the canvas" filter never had to trigger, but it's still there for a hallucinated id.

**2026-08-23 — Connect New Node on Digital Twin + re-viewable credentials (Claude)**
- User wanted a way to add a node to the topology from the UI instead of the agent self-registering
  over the network (security: an unauthenticated script shouldn't be able to mint infra nodes). Added
  a "Connect New Node" button (`src/app/digital-twin/page.tsx`, Mission Control header) opening
  `src/components/nodes/ConnectNodeModal.tsx` — a centered modal (no existing centered-modal
  component; `SlideOver` is a side panel, so built this one following its backdrop/styling
  conventions) with Node Name/Type/Location/Department fields. On submit it calls
  `nodeAdminService.createNode` (`src/services/nodeAdmin.service.ts`, new) → `POST /agent/register`,
  then shows the returned Node ID + API Key with copy buttons — these get pasted into the agent's
  startup dialog on the machine to be monitored.
- "Seen later" requirement: added a **Show Node ID & API Key** button to `NodeInspector.tsx`'s side
  panel (any node, not just freshly-created ones) that lazily fetches from the new
  `GET /nodes/{id}/credentials` endpoint via `nodeAdminService.getCredentials`. Pulled the
  copy-to-clipboard UI out into a shared `src/components/ui/CopyField.tsx` since both the modal and
  the inspector needed it.
- Backend counterpart (`InfraMind.py` repo, same session): `POST /agent/register` is now
  Bearer-protected (`Depends(require_bearer)`) — same auth as every other admin/dashboard route — so
  only the authenticated frontend can create nodes; the standalone agent script no longer calls this
  endpoint at all. Added `GET /nodes/{id}/credentials` (also Bearer-protected) returning the stored
  plaintext `api_key` again, since it's otherwise only returned once at creation time. Added
  `GET /agent/whoami` (X-API-Key protected) so the agent can authenticate with just node_id+api_key
  and learn its own name/type without ever registering itself. Full detail in
  `InfraMind.py/context/DEVELOPMENT_STATUS.md`'s 2026-08-23 agent note.
- Both new endpoints were deliberately left off `MCP_TOOL_OPERATIONS`' allowlist in
  `backend/main.py` (credentials because it's a secret, register because node creation isn't an
  LLM-agent action) — no change needed there since it's opt-in, not opt-out.

**2026-08-26 — Team/Roles + Invite-Gated Access, MongoDB layer (Claude)**
- Added a MongoDB-backed team/role layer on top of Clerk auth: a signed-up user gets **no app
  access** until an Admin assigns them a department + role. New deps: `mongoose`, `svix`.
- **Models** (`src/lib/models/User.ts`, `Membership.ts`) — `User` mirrors Clerk identity 1:1;
  `Membership` is the actual ACL record (`department`, `role`, `status: PENDING|ACTIVE|REVOKED`,
  `invitedBy`/`invitedAt`/`activatedAt`). Enums (`DEPARTMENTS`/`ROLES`/`STATUSES`) live in
  `src/lib/auth/constants.ts` — kept mongoose-free so client components (the admin table's
  dropdowns) can import them without pulling a server-only driver into the browser bundle.
- **Connection**: `src/lib/mongodb.ts`, standard cached-global singleton against `MONGODB_URI`
  (new env var — same Atlas cluster as the pre-existing `MONGODB_URL`, with an explicit
  `/inframind` db name added; both now in `.env.local`/`.env.local.example`).
- **Webhook**: `src/app/api/webhooks/clerk/route.ts` — svix-verified (`CLERK_WEBHOOK_SECRET`,
  currently blank locally, needs the real signing secret from Clerk's dashboard once a webhook
  endpoint is registered there). `user.created` upserts `User` + creates `Membership`
  (bootstrap-admin rule: email in `ADMIN_EMAILS` → auto `ACTIVE`/`ADMIN`/`ADMIN`, seeded with this
  account's own email so there's an admin to test with). `user.deleted` sets `Membership.status =
  REVOKED`. Route added to `middleware.ts`'s public matcher (Clerk calls it with no session).
- **RBAC helpers**: `src/lib/auth/rbac.ts` — `getCurrentMembership()` (lazily creates the
  User+Membership pair on first call per Clerk user, applying the same bootstrap rule as the
  webhook so login works even before the webhook fires), `requireActiveMembership()` (redirects:
  no session → `/sign-in`, session but not ACTIVE → `/waiting-approval`), `requireRole()` /
  `requireDepartment()` / `requirePermission()` for API routes (401/403 `NextResponse`, no throw).
  Permission matrix lives in `src/lib/auth/permissions.ts` per the spec's table (VIEWER read-only,
  ANALYST scoped, CAB_APPROVER approves, ADMIN everything).
- **Gating**: rather than moving `digital-twin/` and `simulation/` into a new `(app)` route group
  (blocked — `git mv` hit `Permission denied` on both directories; a running `next dev` process
  was holding watcher locks on them, and killing an unfamiliar background process without asking
  felt like the wrong call mid-task), added a thin `layout.tsx` to each of those two existing
  route roots that wraps children in the new `src/components/auth/AccessGate.tsx` server
  component (just calls `requireActiveMembership()`). Net effect is identical to a shared
  route-group layout — same two redirects, no URL changes — just done as two files instead of one
  move. `src/app/admin/layout.tsx` does the same but additionally requires `role === 'ADMIN'`
  (redirects non-admins to `/digital-twin`). `/waiting-approval` (new page, `src/app/waiting-approval/`)
  and `/api/webhooks/clerk` were added to `middleware.ts`'s public matcher; `DashboardLayout.tsx`
  now also treats `/waiting-approval` as chromeless (no navbar) since a pending user shouldn't see
  nav items that will just redirect them back.
- **Admin panel**: `/admin/team` (`src/app/admin/team/page.tsx`) — two tables (pending signups
  with department/role dropdowns + Approve; active members with inline edit dropdowns + Revoke),
  backed by 4 new routes under `src/app/api/admin/`: `GET pending-users`, `POST invite`,
  `GET members`, `PATCH`/`DELETE members/[id]`. All four call `requireRole(['ADMIN'])` first. Added
  a "Team" link to the Digital Twin sub-nav in `Navbar.tsx` — visible to everyone, but non-admins
  get redirected by the layout guard on click; didn't wire up conditional visibility since that'd
  need a client-side membership fetch and the enforcement itself is server-side either way.
- **FastAPI boundary audit (§8 of the task)**: confirmed FastAPI has and gets zero identity/role
  concept — nothing changed there, correctly. But the *scoping* half of §8 ("Next.js does the
  filtering before data reaches the client") is only partially true today, and I'm flagging it
  rather than quietly wiring a role param into the backend calls: `src/lib/backendAdapters.ts` and
  every `src/services/*.service.ts` for the Digital Twin (graph, node health) call the FastAPI
  backend **directly from the browser** via `src/lib/axios.ts` — there is no Next.js API
  route/server action in between to sit `getCurrentMembership()` in front of. Today every ACTIVE
  member (any role/department) sees the full, unscoped `/fleet/graph` and node list; the RBAC
  layer built this session gates *whether* you get into `/digital-twin` at all, not *what subset*
  of it you see once in. Making department-scoped graph filtering real means either (a) proxying
  those calls through new Next.js API routes that call FastAPI server-side and filter the response
  before it reaches the client, or (b) adding department tags to graph nodes so FastAPI can be
  asked to filter (still fine per the boundary rule as long as the *concept* of department is a
  plain data tag FastAPI stores/returns, not something it reasons about) — a bigger, separate
  decision for a human, not something to default into this pass. `runWhatIfSimulations`/
  `approveCabChanges` gating (§7's matrix) is similarly unenforced on the Simulation Lab
  pages/services yet — flagging alongside the graph-scoping gap since both need the same "add a
  requireRole/requirePermission check before the existing client-side service call fires" pattern
  applied page-by-page, which is real work, not a one-liner.
- Verified via `npx tsc --noEmit` (clean) and `npx next build` (clean; all new routes registered:
  `/admin/team`, `/api/admin/*`, `/api/webhooks/clerk`, `/waiting-approval`).
- **Handoff for the next agent** (e.g. whoever wires Neo4j dept-scoping): the fields to key off of
  are `Membership.department` and `Membership.role` (both plain string enums, see
  `src/lib/auth/constants.ts`), obtainable server-side via `getCurrentMembership()` in
  `src/lib/auth/rbac.ts`. The gap above (client calls FastAPI directly, unscoped) is the first
  thing that needs a decision before department-scoped graph views can exist for real.

**2026-08-22 — Scenario Builder AI Copilot (Claude)**
- The "Build with AI" button did nothing at all — `handleNlQuery` started with
  `if (!prompt.trim() || !currentPlan) return`, and `currentPlan` starts `null` in
  `useAppStore` and was never initialized anywhere, so every click returned immediately.
  Decoupled the guard: the canvas edit no longer requires a plan to exist (plan tracking is
  now best-effort bookkeeping only, same lenient pattern the drag-and-drop handler already used).
- Wired a real LLM behind it: `src/app/api/nl/route.ts` (new Next.js route, Node runtime) takes
  the prompt + current canvas (nodes/edges) and calls Claude Opus 5 via
  `client.messages.parse()` with a Zod-defined structured-output schema (see
  `@anthropic-ai/sdk/helpers/zod`) — returns exactly `{intent, message, nodesAdded, nodesRemoved,
  edgesAdded, edgesRemoved}`, no brittle text parsing. Mechanical GraphNode fields (dependencyCount,
  dependencies/dependents, lastSync, metadata) are filled in server-side rather than asked of the
  model; any nodesRemoved/edgesRemoved id the model returns that isn't actually in the canvas it
  was given gets filtered out defensively before reaching the client.
- `nlService.processQuery` now takes a second `{nodes, edges}` argument and, live, calls this
  app's own `/api/nl` via `fetch` — **not** the `api` axios client, since that's wired to the
  Python backend and this has nothing to do with it (no LLM concept there).
- Requires `ANTHROPIC_API_KEY` server-side only (added to `.env.local.example`, no
  `NEXT_PUBLIC_` prefix — never sent to the browser). Verified the whole pipeline compiles,
  builds (`/api/nl` registers as a dynamic route), and — with no key configured in this
  environment — returns the intended clean `"AI Copilot is not configured…"` 500 rather than
  crashing; an actual end-to-end model call still needs a real key, which only the user has.

**2026-08-29 — Phase 1 task 5 re-check: Manual browser pass on `/digital-twin` (Codex)**
- Re-read the plan and confirmed the first unchecked item in the lowest incomplete phase is still the manual browser pass on `/digital-twin`; per the program rules, did not skip ahead to a later implementation task.
- Re-checked tool availability before calling it blocked:
  - No browser automation capability is exposed in this session. `tool_search` surfaced only document-control and plugin-management tools; nothing Playwright/browser-like is available.
  - The page is behind Clerk auth, so an unauthenticated fetch would not satisfy the required click-through anyway.
- **Blocked, checkbox remains unchecked.** No frontend code changed because this task is a manual visual/runtime verification step and the required browser surface is absent here.
- Files touched: `context/CONTEXT.md` only.
- Real bugs found: none in code; blocker is environment capability only.
- Next agent/user action: run an authenticated browser pass on `/digital-twin` and verify the drawer, type-specific panels, filters, hover tooltips, re-layout button, and neighbor-dimming. If all render correctly, then tick the Phase 1 checkbox.

**2026-08-29 — Phase 1 follow-up: Fix `classifyHealth` simulating override (Claude)**
- **Bug**: `classifyHealth()` in `src/lib/backendAdapters.ts` returned `'healthy'` unconditionally
  for any node with `status === 'simulating'`, regardless of actual `health_score`. A node running
  a `node_failure` simulation (health_score → 0) would read "healthy" in the UI.
- **Fix**: Removed the `if (status === 'simulating') return 'healthy'` branch entirely. Health is
  now classified purely from `health_score` (matching the original thresholds: ≥80 healthy, ≥50
  degraded, else critical), with offline/zero-score still mapping to `unreachable`.
  `isSimulating` on `GraphNode` (set in `adaptFullGraph`) remains for the cyan badge treatment and
  for callers that need to exclude simulating nodes from aggregate counts.
- **`nodeHealth.service.ts` `getSummary()`**: Added `if (n.status === 'simulating') continue` in
  the bucket loop so the node-health page's summary counts match the digital-twin page's donut
  (which already filtered `nonSimNodes` correctly).
- **digital-twin/page.tsx**: No changes needed — it already filtered `isSimulating` out of
  `atRiskNodes`/`criticalNodes` and used `nonSimNodes` for the health donut buckets; with
  `classifyHealth` now returning the real classification, a simulating critical node will appear
  in `criticalNodes` only if `isSimulating` is false (i.e., it won't — which is correct; it shows
  in the "Simulating" donut slice instead).
- Files touched: `src/lib/backendAdapters.ts`, `src/services/nodeHealth.service.ts`.
- `tsc --noEmit` and `next build` both clean.
- Next task: Phase 1 follow-up — "Node Failure sim still reads healthy in the frontend" — a
  live re-verification step against a running `node_failure` simulation from the agent GUI.
  Requires backend + agent running; cannot be done in code alone.

**2026-08-29 — Phase 1 follow-up: Network Storm not captured (Claude)**
- **Root cause investigation**: `node.status_changed` WS event only carries `{status, health_score}`.
  During a network_storm simulation, the backend's risk_engine computes health_score from
  CPU/memory/disk only — network throughput does not factor in. So health_score stays ~100 and
  `classifyHealth` returns `'healthy'`, even with the correct fix from the previous iteration.
  The `metrics.updated` WS event (fired every heartbeat) carries `simulation_active` and
  `simulation_type` — but the digital-twin page was not subscribed to it.
- **Fix**: Added `simulationType?: string` to `GraphNode` in `src/types/graph.ts`. In
  `digital-twin/page.tsx`, added a second WS subscription to `metrics.updated` that updates
  each node's `simulationType` from `payload.simulation_type` when `simulation_active=true`,
  and clears it when `simulation_active=false`. The `node.status_changed` handler was also
  updated to clear `simulationType` when the node transitions out of simulating status.
- **Visual**: In `GraphNode.tsx`, added a cyan pill below the node label showing the active
  simulation type (e.g. "network storm") whenever `isSimulating && simulationType`. The hover
  tooltip also shows the sim type inline. This makes network_storm (and other type-specific
  simulations that don't move health_score) visible at a glance on the digital twin canvas.
- `computeNetworkThroughput()` in `backendAdapters.ts` was verified correct — it computes
  delta of cumulative `net_bytes_sent`/`net_bytes_recv` between consecutive samples, which IS
  what the agent sends (heartbeat.py adds `net_send_rate * interval` bytes each cycle).
  The node-health page does pick this up on its 30s auto-refresh; it just doesn't classify
  the node as at-risk because health_score stays high. That's the backend-side half of this
  ask (risk_engine weighting network throughput), flagged in Backend backlog — not touched.
- Files touched: `src/types/graph.ts`, `src/app/digital-twin/page.tsx`,
  `src/components/graph/GraphNode.tsx`.
- `tsc --noEmit` and `next build` both clean.
- **Note on "Node Failure sim still reads healthy"** (the task before this one): The
  `classifyHealth` code fix is confirmed in place — verified in this session. The task itself
  is purely a live-verification step (run node_failure from the agent GUI and confirm the node
  turns critical on canvas). Cannot be performed without a running backend + agent. Left
  unchecked; next person with the backend running should tick it after confirming.
- Next task: Phase 1 follow-up — "Remediate's effect should stay visible for a few seconds"
  (NodeInspector.tsx 4-5s toast/banner after Execute).

**2026-08-29 — Phase 1 follow-up: Remediate's effect stays visible 4-5s (Claude)**
- **Change**: `NodeInspector.tsx`'s inline remediation feedback upgraded from a tiny persistent
  `<p>` tag to a full-width green/red banner that auto-clears after 4500ms.
- `useRef<ReturnType<typeof setTimeout>>` stores the timer handle. `showExecuteResult()` wrapper
  cancels any in-flight timer before setting a new one, preventing stale state if the user hits
  Execute twice rapidly. The timer is also cleared in the `useEffect` cleanup branch so switching
  nodes or closing the panel never leaves a dangling timeout.
- Visual: banner has a bold ✓/✕ prefix, colored border + background (emerald or crimson), and
  full readable width inside the action card — clearly visible compared to the prior 10px text.
- Files touched: `src/components/graph/NodeInspector.tsx`.
- `tsc --noEmit` and `next build` both clean.
- Next task: Phase 1 follow-up — "Node detail should open centered with focus, not as a side
  drawer." Change `NodeInspector`'s `SlideOver` host to a centered, dimmed/blurred modal.

**2026-08-29 — Phase 1 follow-up: Node detail opens as centered modal (Claude)**
- **Change**: Replaced `SlideOver` (right-edge panel, `x: 100% → 0` slide-in) with a new
  `CenteredModal` component in `NodeInspector.tsx`. Node clicks now pop open a centered,
  focused dialog — background dims to `bg-black/70 backdrop-blur-sm`, panel animates in
  with `scale: 0.95 → 1` + subtle `y: 8 → 0` spring entrance. Content is unchanged.
- **New component**: `src/components/ui/CenteredModal.tsx` — same props API as `SlideOver`
  (`open`, `onClose`, `title`, `subtitle`, `children`, `width`) with `w-full max-w-[520px]`
  default and `max-h-[90vh] overflow-y-auto` so tall node panels remain scrollable.
  Escape key + backdrop click both close it, matching SlideOver behavior.
- `NodeInspector.tsx`: import swapped from `SlideOver` → `CenteredModal`; `width` prop removed
  (the default `max-w-[520px]` is appropriate; no custom override needed).
- `SlideOver.tsx` is untouched — other callers may still use it (none confirmed at this time,
  but it's a generic UI primitive worth keeping).
- `tsc --noEmit` clean; `next build` clean.
- Next unchecked task: Phase 2 follow-up — "Save must actually include edges, not just nodes."

**2026-08-29 — Phase 2 follow-up: Save includes edges (and node positions) (Claude)**
- **Root cause**: `FlowCanvas` uses React Flow's internal `useEdgesState` / `useNodesState`.
  When the user draws a connection (`onConnect`) or drags a node to a new position, those
  changes live only in FlowCanvas's internal state — no path to bubble them back up to
  `scenario-builder/page.tsx`'s `edges`/`nodes` state. `ScenarioToolbar.handleSave` reads
  from the parent state, so newly drawn edges were silently dropped on every Save.
- **Fix**: Added two new optional props to `FlowCanvas`/`FlowCanvasInner`:
  - `onEdgesUpdate?: (edges: GraphEdge[]) => void` — called inside `onConnect` after
    `addEdge` with the full updated edge list, and inside a new `handleEdgesChange` wrapper
    on edge removals. `fromFlowEdge` converts React Flow `Edge` → `GraphEdge`, defaulting
    `type` to `'DEPENDS_ON'` and `health` to `'healthy'` for user-drawn connections.
  - `onNodesUpdate?: (nodes: GraphNodeData[]) => void` — called from `handleNodeDragStop`
    (once per drag-end, not every pixel) via `fromFlowNode` which strips `isDimmed`/`isNeighbor`
    display state before syncing positions back to the parent.
- In `scenario-builder/page.tsx`, wired `onEdgesUpdate={handleEdgesUpdate}` and
  `onNodesUpdate={handleNodesUpdate}` to the `FlowCanvas`. Both handlers call
  `setEdges`/`setNodes`, keeping parent state in sync so Save/Save As send the full topology.
- Files touched: `src/components/graph/FlowCanvas.tsx`,
  `src/app/simulation/scenario-builder/page.tsx`.
- `tsc --noEmit` clean; `next build` clean.
- Next unchecked task: Phase 2 follow-up — "Remove-node capability in Scenario Builder."

**2026-08-29 — Phase 2 follow-up: Remove-node capability in Scenario Builder (Claude)**
- **FlowCanvas.tsx**: Updated `handleNodesChange` to call `onNodesUpdate` when node removes occur
  while `readOnly=false`. The removed node IDs are computed from the `changes` array (pre-change
  snapshot, same pattern already used in `handleEdgesChange`) and the post-remove node list is
  derived by filtering `nodes`. This wires keyboard Delete/Backspace (React Flow fires `remove`
  changes natively when `elementsSelectable=true`) so the parent state actually stays in sync.
  Cascading edge cleanup on keyboard delete was already handled: React Flow fires `onEdgesChange`
  with `remove` events for incident edges, and the existing `handleEdgesChange` already calls
  `onEdgesUpdate` on those.
- **scenario-builder/page.tsx**:
  - Added `selectedNodeId` state (nullable string).
  - Added `handleNodeSelect` (toggle: clicking the same node again deselects).
  - Added `handleDeleteSelectedNode` — filters selected node and all incident edges from state,
    then clears `selectedNodeId`.
  - Updated `handleNodesUpdate` to also clear `selectedNodeId` if the formerly-selected node is
    no longer in the returned array (handles keyboard-initiated deletes where React Flow fires
    the change before the parent state update).
  - Passed `selectedNodeId` and `onNodeClick={handleNodeSelect}` to `FlowCanvas` (enables
    neighbor-dimming highlighting when a node is selected, which is already built into FlowCanvas).
  - Added a centered contextual pill (`absolute top-3 left-1/2`) visible only when a node is
    selected; contains "Delete" button (red, Trash2 icon) and "✕" dismiss. Both are
    pointer-events-auto so the canvas backdrop clicks still work.
- Files touched: `src/components/graph/FlowCanvas.tsx`,
  `src/app/simulation/scenario-builder/page.tsx`.
- `tsc --noEmit` clean; `next build` clean.
- Deletion flows:
  1. Click a node → pill appears → click Delete in pill → node + incident edges removed.
  2. Click a node → press Delete/Backspace keyboard key → React Flow fires remove → parent
     state syncs via the updated `handleNodesChange`.
- Next unchecked task: Phase 1 follow-up — "Node Failure sim still reads healthy in the
  frontend" — a live re-verification step against a running `node_failure` simulation from the
  agent GUI. Requires backend + agent running; cannot be done in code alone. After that, Phase 3
  first unchecked: derive impact vectors, downtime distribution, and compliance flags from the
  graph + NodeBusinessMeta, replacing mockSimulation.ts.

**2026-08-29 — Phase 3: Derive impact vectors, downtime distribution, compliance flags (Claude)**
- **New route**: `GET /api/simulation/[id]/impact` — derives the full display payload from a
  persisted `SimulationRun` + `NodeBusinessMeta` docs. No FastAPI calls; all computation is
  Next.js-side. Returns: `impactVector` (availability, latencyDelta, costDelta, riskScore,
  downtimeHours), `downtimeDistribution` (7-bucket histogram over historical runs for the same
  architecture), `complianceFlags` (21CFR11, SOC2, GxP, ISO27001 derived from SLA tier +
  criticality of impacted nodes), `selfHealingRecs` (up to 4 ranked recs from sim type +
  blast depth + revenue-weighted node priority), `simulationVectors` (origin + depth-1
  cascade vectors), and `meta` (runId, riskScore, blastRadiusCount, etc.).
- **`simulation.service.ts`**: Removed all `USE_MOCK` branches and mock imports. All methods
  now call `GET /api/simulation/${runId}/impact` via a module-level `Promise` cache so
  multiple tab-level calls within one page load hit the network once. Added `getFullImpact()`
  as the primary entry point for the results page.
- **`results/page.tsx`**: Reads `runId` from `useSearchParams()`. Fetches the full impact
  payload on mount (cancelled on unmount). Renders real data in every tab:
  - Impact: availability %, latency delta, revenue exposure, risk score from `impactVector`;
    downtime histogram from `downtimeDistribution`.
  - Graph: live topology with health scores reduced (unchanged).
  - Self-Healing: dynamically ranked recommendations from `selfHealingRecs` with real
    blast-reduction percentages, timing, and success rates.
  - Business: real revenue exposure from NodeBusinessMeta; graceful empty state if no meta.
  - Compliance: real flags with framework/severity/status from `complianceFlags`; pass badge
    for resolved flags. Empty state when no flags raised.
  - No-run state: shown when page loads without `?runId=` param.
- **`scenario-builder/page.tsx`**: `handleSimulate` now calls `POST /api/simulation/analyze`
  with `loadedArchitectureId` + first node + `scenario_analysis` type, then navigates to
  `/simulation/results?runId=<id>`. Falls back to results page without runId if no architecture
  is loaded or the call fails. `loading` state covers the analyze round-trip.
- **mockSimulation.ts**: Not deleted (other files may import its types indirectly), but
  simulation.service.ts no longer imports or uses it. It can be removed in a cleanup pass.
- Files touched: `src/app/api/simulation/[id]/impact/route.ts` (new),
  `src/services/simulation.service.ts`, `src/app/simulation/results/page.tsx`,
  `src/app/simulation/scenario-builder/page.tsx`.
- `tsc --noEmit` clean; `next build` clean; ESLint clean on all 4 changed files.
- Next unchecked task: Phase 3 — Wire results/page.tsx to the above (already done as part
  of this task). Next is: "Node business-metadata editor (revenue/hour, SLA tier) so the money
  figures have real inputs." That is Phase 3's third task.

**2026-08-29 — Phase 3: Node business-metadata editor (Claude)**
- **New API route**: `GET /api/nodes/[nodeKey]/business-meta` — fetches the NodeBusinessMeta
  doc for a node; returns `{ meta: null }` if no record exists yet (not an error — new nodes
  start without business metadata). `PUT /api/nodes/[nodeKey]/business-meta` — partial upsert
  (any subset of fields may be supplied; unset fields are left unchanged). Validates each
  field before writing, uses `findOneAndUpdate` with `upsert: true`, calls `logActivity` with
  action `node.business_meta.update`. Both routes gated with `getCurrentMembership` (any
  ACTIVE member, not admin-only — same reasoning as architecture saving). `nodeKey` in the
  URL is URL-encoded; the route decodes via `decodeURIComponent`.
- **NodeInspector Business Metadata section**: Collapsible section (chevron toggle) above the
  Refresh button. Shows a pencil edit icon in the header row when meta is loaded and not in
  edit mode. Loads meta in parallel with node health via `loadBizMeta()` called from the
  same `useEffect` that calls `load()`.
  - **View mode**: revenue/hr (emerald, formatted with `toLocaleString`), criticality badge
    (colour-coded: crimson/amber/cyan/muted), SLA tier badge (violet/amber/slate/orange), and
    business-processes chips (cyan). Empty state prompts "No business metadata set yet. Add now."
  - **Edit mode** (entered via pencil or "Add now"): revenue/hr number input, SLA tier select
    (platinum → bronze), criticality select (critical → low), business-processes chip manager
    (add via input + Enter or + button, remove via ✕ on each chip). Save calls `PUT`, updates
    local state from the response, exits edit mode. Cancel exits without saving. Error message
    appears inline below the form if the PUT fails.
  - `SLA_TIERS` / `CRITICALITY_LEVELS` imported from the mongoose-free
    `lib/nodeBusinessMeta/constants.ts` (no driver in bundle).
- Files touched: `src/app/api/nodes/[nodeKey]/business-meta/route.ts` (new),
  `src/components/graph/NodeInspector.tsx`.
- `tsc --noEmit` clean; `next build` clean; API route ESLint clean.
  NodeInspector has the pre-existing `react-hooks/set-state-in-effect` lint warning on
  `load()` — documented as known noise in the verification gate; no new violations added.
- Phase 3 is now fully complete. Next unchecked task: Phase 1 follow-up — "Node Failure sim
  still reads healthy in the frontend" (live verification, requires backend + agent running).
  After that: Phase 4 — delete hardcoded `divergencePercent = 34` and build out
  `shadowRun.service.ts` from scratch.

**2026-08-29 — Phase 1 follow-up: "Node Failure sim still reads healthy" — code audit (Claude)**
- **Task**: First unchecked task in the lowest incomplete phase — re-verify that the
  `classifyHealth` regression fix (marked [x] above) actually resolves the "node_failure
  reads healthy" symptom reported against a live agent GUI.
- **Code audit findings** (all correct, no further fixes needed on the frontend side):
  - `classifyHealth()` in `backendAdapters.ts:143` — correctly classifies from real
    `health_score` only; `'simulating'` status is NOT a special case; offline/zero → 'unreachable',
    ≥80 → 'healthy', ≥50 → 'degraded', else → 'critical'. A node_failure sim with a
    low backend health_score will correctly return 'critical'.
  - `adaptFullGraph` (backendAdapters.ts:177): sets `isSimulating: n.status === 'simulating'`
    independently of the health classification.
  - `digital-twin/page.tsx:100-103`: WS `node.status_changed` handler re-classifies from
    the payload's `health_score` (not unconditionally 'healthy'); sets `isSimulating` from
    `payload.status === 'simulating'`.
  - `digital-twin/page.tsx:194-216`: `atRiskNodes` and `criticalNodes` derive from
    `nonSimNodes` (simulating excluded), so simulating nodes appear in the cyan "Simulating"
    donut slice — not in the failure buckets. This is correct per-design.
  - `nodeHealth.service.ts:77`: `getSummary` explicitly `continue`s for simulating nodes.
  - `GraphNode.tsx:27`: renders cyan dot when `isSimulating`, while real `health` field
    still reflects the actual classification for node-detail panels.
- **Cannot complete live verification here** — requires backend + agent running a live
  `node_failure` simulation. Whether the node reads 'critical' during node_failure depends
  on whether the FastAPI agent actually drops `health_score` during that simulation type
  (if the backend keeps `health_score` high and only changes `status → 'simulating'`, the
  node will still classify 'healthy' — that would be a backend-side issue, not frontend).
- **Checkbox left unchecked** — live re-verification still needed. Once confirmed working
  (or once a backend-side bug is identified and filed in the backend backlog), tick the box.
- **Next implementable task**: Phase 4, first unchecked — delete hardcoded
  `divergencePercent = 34` and build `shadowRun.service.ts` from scratch.

**2026-08-29 — Phase 4 Task 1: Remove hardcoded divergence 34%; build shadowRun.service.ts (Claude)**
- **`shadowRun.service.ts`** completely rewritten — no more USE_MOCK-gated stubs returning zeros:
  - `getLiveMetrics()`: calls FastAPI `/fleet/summary` (via the shared `api` axios instance).
    Backend exposes no fleet-level CPU/memory aggregate, so tiles are health-derived proxies:
    CPU = `(100 − avg_health_score) × 0.65 + degraded_ratio × 35`, memory = `(100 − avg) × 0.82`,
    latency = `12 + (100 − avg) × 1.8 + active_alerts × 2`. `activeSessions` is the real
    `online_nodes` count. Errors (backend down) are caught on the page — previous values
    remain displayed rather than resetting to zero.
  - `startRun(liveNodes, simNodes)` → `RunResult`: pure local computation, no API call.
    Matches nodes by ID; for each matched pair computes `|liveHealth − simHealth|`.
    `divergence = mean(|deltas|)` — already in 0–100 range → reads as divergence %.
    `cpuDelta = mean(load increase for degraded sim nodes × 0.55)`.
    `latencyDelta = divergence × 1.6`.
    `projectedDowntime = criticalSimCount × 0.5h`.
    `revenueAtRisk = 0` (no NodeBusinessMeta context at this stage; Task 3 can enrich).
  - `getSimulatedMetrics()` removed — data flows from `startRun()` directly.
  - Added `RunResult` interface (`SimulatedMetrics + divergence`); `SystemMetrics` and
    `SimulatedMetrics` unchanged for backward compatibility.
- **`shadow-run/page.tsx`**:
  - `divergencePercent = simCompleted ? 34 : 0` deleted; replaced by `divergence` state (number).
  - `handleRun` updated: calls `startRun(liveNodes, simNodes)`, destructures `{ divergence: div, ...metrics }`, sets both `setDivergence(div)` and `setSimMetrics(metrics)`. No more `getSimulatedMetrics` call.
  - Divergence meter reads from `displayDivergence = simCompleted ? divergence : 0`.
  - Impact label unchanged; center column shows "PENDING" instead of no label before run.
  - Tile label "Active Sessions" → "Nodes Online" (reflects what `activeSessions` actually is from `online_nodes`).
  - Live metrics poll wrapped in try/catch — backend-down doesn't crash the poll loop.
- Files touched: `src/services/shadowRun.service.ts`, `src/app/simulation/shadow-run/page.tsx`.
- `tsc --noEmit` clean; `next build` clean; ESLint clean on both files.
- **Divergence is real math over actual node health scores.** Until Phase 4 Task 2 loads a
  saved Architecture on the right side, the sim side is still the live graph with −10 health,
  so divergence will read ~10% consistently. Once Task 2 loads a real saved architecture with
  different node configs, the divergence will vary meaningfully.
- Next unchecked task: Phase 4 Task 2 — "Sim side loads a saved Architecture from Phase 2."

**2026-08-29 — Phase 4 Task 2: Sim side loads a saved Architecture (Claude)**
- **Task**: Replace the sim panel's hardcoded scenario dropdown with a real architecture picker backed by the Phase 2 Architecture API.
- **`shadow-run/page.tsx`** changes:
  - Removed the placeholder `setSimNodes(liveNodes.map(n => ({ ...n, healthScore: n.healthScore - 10 })))` stub from the initial `useEffect` — the sim panel now starts empty until the user picks an architecture.
  - Added `archList` state (fetched from `GET /api/architectures` on mount), `selectedArchId`, `loadedArchName`, `loadingArch`, `archError` states.
  - `handleArchSelect(archId)`: fetches `GET /api/architectures/{id}`, sets `simNodes`/`simEdges` directly from the stored `architecture.nodes`/`architecture.edges`. Because the Architecture model stores nodes as Mixed (raw GraphNode[]) including their React Flow `position: { x, y }` fields, positions are preserved exactly — no re-scatter.
  - Right panel header: replaced the hardcoded `<select>` with a real one populated from `archList`. Shows a Loader2 spinner while fetching, lists each arch as `{name} ({nodeCount}n)`.
  - Controls area: when an architecture is loaded, shows its name (cyan) and node/edge counts; otherwise shows a "no architecture loaded" prompt. The "Run Shadow Sync" button is `disabled` when `simNodes.length === 0`.
  - Sim topo area: replaced the always-showing FlowCanvas with a conditional — shows the canvas when `loadedArchName` is set, otherwise shows a `FolderOpen` empty state prompt.
  - Awaiting-shadow-run empty state: text adapts ("Load an architecture then run" vs "Awaiting shadow run execution").
  - `FolderOpen` and `Loader2` added to lucide imports.
- **No changes to `shadowRun.service.ts`** — `startRun(liveNodes, simNodes)` already does the right thing; now that simNodes comes from a real saved architecture (with potentially different node configs and health scores), divergence will reflect genuine topology differences rather than a uniform −10 shift.
- Files touched: `src/app/simulation/shadow-run/page.tsx`.
- `tsc --noEmit` clean; `next build` clean; ESLint clean.
- **Position fidelity**: the Architecture schema stores `nodes` as `Mixed` (i.e., whatever was passed at save time), which is `GraphNode[]` including React Flow `position: { x, y }`. FlowCanvas renders from those positions directly, so a loaded architecture appears in its saved layout with no re-scatter.
- Next unchecked task: Phase 4 Task 3 — "Persist every run as a ShadowRun; add an architecture-scoped run-history tab."

**2026-08-29 — Phase 4 Task 3: Persist every ShadowRun + architecture-scoped run-history tab (Claude)**
- **Task**: After a shadow run completes, persist the result to Mongo and expose a "Run History" tab showing past runs scoped to the selected architecture.
- **New API route `src/app/api/shadow-runs/route.ts`**:
  - `GET ?architectureId=<id>` — lists `ShadowRun` docs for one architecture, newest-first (default limit 50). Verifies the caller has access to the architecture via the same $or scoping logic as `/api/architectures` GET. Returns `{ runs: [{ id, architectureId, divergence, metrics, status, createdAt }] }`.
  - `POST` — persists a completed run: validates `architectureId` + `divergence`, checks architecture access, creates a `ShadowRun` with `status: 'completed'`, calls `logActivity` with action `shadow_run.start`. Returns `{ shadowRun: {...} }` (201).
  - Auth: `getCurrentMembership` + 403 (any ACTIVE member, not admin-only).
- **`shadow-run/page.tsx`** changes:
  - Added `activeTab: 'comparison' | 'history'` state; tab bar appears above the 3-column layout.
  - Architecture picker moved into the tab bar (so it governs both tabs from one place).
  - `handleArchSelect` now fetches the architecture AND the run history in parallel (`Promise.all`). History is loaded at selection time rather than in a `useEffect` (avoids the `react-hooks/set-state-in-effect` lint error).
  - `handleRun`: after `startRun` succeeds, POSTs to `/api/shadow-runs` with `liveSnapshot`, `simSnapshot`, `divergence`, and `metrics`. On success, prepends the new run to `runHistory` state immediately so it appears at the top of the history tab without a refetch. A `persistError` banner surfaces inline (amber) if the POST fails.
  - **History tab**: when no architecture selected → empty state with prompt; while loading → spinner; no runs → empty state + hint to switch tabs and run; otherwise renders a list of run cards, each with a mini divergence ring, impact label, date/time, CPU/latency/downtime metric chips. Architecture name shown in header.
  - `impactFor()` helper extracted to avoid duplication between the live meter and the history list.
- Files touched: `src/app/api/shadow-runs/route.ts` (new), `src/app/simulation/shadow-run/page.tsx`.
- `tsc --noEmit` clean; `next build` clean (new route appears as `ƒ /api/shadow-runs`); ESLint clean on both files (no new lint errors — existing react-hooks/set-state-in-effect pattern avoided by design).
- **Next unchecked tasks**:
  - Phase 1 follow-up: "Node Failure sim still reads healthy" — blocked on live backend + agent re-verification (code audit already done, all correct on the frontend side).
  - Phase 4: "Continuous background Shadow Run" — backend backlog, not frontend work.
  - Phase 5: first unchecked task — "Replay reads real SimulationRun + ShadowRun + Architecture docs, replacing four hardcoded rows in replay.service.ts."

**2026-08-29 — Phase 5 Task 1: Replay reads real SimulationRun + ShadowRun + Architecture docs (Claude)**
- **Task**: Replace the four hardcoded rows in `replay.service.ts` and its zero-API-call stubs with real Mongo-backed data. The `USE_MOCK` branch and static rows are gone.
- **New API route `src/app/api/simulation/history/route.ts`** — `GET /api/simulation/history`:
  - Auth: `getCurrentMembership` + 403 (any ACTIVE member, not admin-only).
  - Builds the same architecture-visibility `$or` clause as `/api/architectures` GET (own | department | sharedWith) to scope which runs are visible.
  - Fetches accessible Architecture ids + names, then in parallel fetches up to 200 SimulationRuns and 200 ShadowRuns for those architectures.
  - Maps SimulationRun → `{ id, date, scenarioName, riskScore, predictedDowntime, cabDecision: null, outcomeLogged: false, architectureId, architectureName, eventType: 'simulation' }`. `scenarioName` = `"{archName} — {simType} on {targetNodeId}"`.
  - Maps ShadowRun → same shape with `eventType: 'shadow'`; `riskScore = round(divergence)`; `predictedDowntime = metrics.projectedDowntime ?? 0`; `scenarioName = "Shadow Run — {archName}"`.
  - Combines + sorts newest-first, returns first 100. `cabDecision` is always `null` (not stored in either model; Phase 6 CAB Copilot could eventually populate it). `outcomeLogged` is always `false` from the API (Phase 5 Task 2 adds persistence for that flag).
- **New API route `src/app/api/simulation/[id]/outcome/route.ts`** — `POST /api/simulation/[id]/outcome`:
  - Body: `{ outcome: string }`. Accepts both SimulationRun and ShadowRun ids (tries SimulationRun first, falls back to ShadowRun).
  - Writes `ActivityLog` row with `action: 'simulation.outcome_logged'`. Returned 404 if neither model has the id.
  - The `outcomeLogged` flag is NOT persisted back to the SimulationRun/ShadowRun doc yet — that's Phase 5 Task 2. ActivityLog is the authoritative record until then.
- **`replay.service.ts`** completely rewritten — no more `USE_MOCK` import, no hardcoded rows.
  - `getHistoryEvents()` → `GET /api/simulation/history`, returns `SimulationEvent[]`.
  - `logOutcome(id, outcome)` → `POST /api/simulation/${id}/outcome`.
  - `SimulationEvent` interface extended with `architectureId`, `architectureName`, `eventType: 'simulation' | 'shadow'`.
- **`replay/page.tsx`** updated:
  - `loadingEvents` / `eventsError` states with inline feedback in the timeline header.
  - Empty state: "No simulation runs yet" prompt when the API returns an empty list.
  - `handleSelectEvent(ev)` replaces the inline `setActiveEvent(ev)` to reset outcome feedback on event switch (avoids introducing a new `set-state-in-effect` pattern).
  - `handleLogOutcome` is now async: calls `replayService.logOutcome`, marks the event `outcomeLogged: true` in local state on success, shows a 4s "Outcome logged" success message or an inline error banner. `alert()` removed.
  - Timeline dots: shadow-run events use cyan-tinted dot style to visually distinguish from simulation-run events (emerald dot).
  - Ghost state panel: adapts label to "Shadow Run" vs "Ghost State" based on `eventType`; "Divergence %" label for shadow-run risk score. Empty state shown when `ghostNodes` is unavailable (backend down). Live-graph ghost topology is still used by the canvas (Phase 5 Task 2 changes it to use stored snapshots).
- **Files touched**: `src/app/api/simulation/history/route.ts` (new), `src/app/api/simulation/[id]/outcome/route.ts` (new), `src/services/replay.service.ts`, `src/app/simulation/replay/page.tsx`.
- `tsc --noEmit` clean; `next build` clean (new routes appear as `ƒ /api/simulation/history` and `ƒ /api/simulation/[id]/outcome`); ESLint clean on all 4 files (no new lint errors).
- **Next unchecked tasks**:
  - Phase 1 follow-up: "Node Failure sim still reads healthy" — blocked on live backend + agent re-verification.
  - Phase 5 Task 2: "Ghost-state viewer renders stored snapshots; logOutcome actually persists" — the canvas should load the stored `liveSnapshot`/`simSnapshot` from the selected ShadowRun (or `blastRadius`/`resultJson` for SimulationRuns) instead of the current live graph; `outcomeLogged` should persist back to the Mongo doc so it survives a refresh.

**2026-08-29 — Phase 5 Task 2: Ghost-state viewer renders stored snapshots; logOutcome persists (Claude)**
- **Task**: Wire the replay ghost-state canvas to stored snapshot data rather than the live graph; make the "Log Actual Outcome" button persist `outcomeLogged: true` to the Mongo doc.
- **`outcomeLogged` field added to both models**:
  - `src/lib/models/SimulationRun.ts`: `outcomeLogged: { type: Boolean, default: false }`
  - `src/lib/models/ShadowRun.ts`: `outcomeLogged: { type: Boolean, default: false }`
  - Old docs without the field read as `false` via `!!r.outcomeLogged` in the history route.
- **`src/app/api/simulation/[id]/outcome/route.ts`** updated: after writing the ActivityLog, now also calls `findByIdAndUpdate(id, { outcomeLogged: true })` on the correct model (SimulationRun or ShadowRun). The stale comment about "Phase 5 Task 2 adds persistence" removed.
- **`src/app/api/simulation/history/route.ts`** updated: `outcomeLogged` added to both projections; `!!r.outcomeLogged` returned instead of hardcoded `false`. Old docs (no field in DB) read as `false` correctly.
- **New `src/app/api/simulation/[id]/snapshot/route.ts`**:
  - `GET /api/simulation/[id]/snapshot` — auth: any ACTIVE member.
  - Tries ShadowRun first: returns `{ type: 'shadow', nodes: liveSnapshot, edges: arch.edges }`.
    `liveSnapshot` is the `GraphNode[]` captured when the shadow run was persisted.
  - Falls back to SimulationRun: fetches architecture nodes/edges, overrides all nodes in the blast radius (+ targetNodeId) to `{ healthScore: 0, health: 'critical' }` to visually show the failure scope. Returns `{ type: 'simulation', nodes, edges, targetNodeId, impactedNodeIds }`.
  - Access-checked: same $or clause as architecture visibility (own | sharedWith | department).
- **`src/app/simulation/replay/page.tsx`** updated:
  - Removed `graphService` import and the initial `graphService.getLiveGraph()` call that zeroed out health scores for the ghost canvas — the canvas now always shows stored snapshot data.
  - Added `snapshotLoading` state; canvas shows a `Loader2` spinner while the snapshot fetches.
  - `loadSnapshot(eventId)` helper function does the fetch; called both on initial mount (for the first event) and in `handleSelectEvent` (async) on each event click.
  - Empty state message adapts: "Snapshot unavailable for this run" when an event is selected but the snapshot 404s (e.g. older runs pre-schema); "Ghost topology unavailable" when no event is selected.
  - Ghost canvas: `opacity-40 grayscale` → `opacity-50` (no grayscale, so SimulationRun blast-radius nodes render in their real critical/healthy colors against the ghost background).
  - `handleLogOutcome` comment about "Phase 5 Task 2" removed — persistence is now implemented.
- **Files touched**: `src/lib/models/SimulationRun.ts`, `src/lib/models/ShadowRun.ts`, `src/app/api/simulation/[id]/outcome/route.ts`, `src/app/api/simulation/history/route.ts`, `src/app/api/simulation/[id]/snapshot/route.ts` (new), `src/app/simulation/replay/page.tsx`.
- `tsc --noEmit` clean; `next build` clean (new route appears as `ƒ /api/simulation/[id]/snapshot`); ESLint clean on all changed files.
- **Next unchecked tasks**:
  - Phase 1 follow-up: "Node Failure sim still reads healthy" — blocked on live backend + agent re-verification (code audit already done, correct on frontend side).
  - Phase 5 Task 3: `/logs` page over `ActivityLog` — filter by actor / action / date / department, RBAC-gated, with an Audit Log filter preset.
  - Phase 5 Task 4: Per-architecture log stream for Replay.

**2026-08-29 — Phase 5 Task 3: /logs page over ActivityLog (Claude)**
- **Task**: Build the `/logs` page with two lenses over `ActivityLog`: Activity Feed (all actions) and Audit Log (security-sensitive preset). RBAC-gated (ADMIN only). Filters: actor email (substring), action (substring, disabled in Audit mode), department (enum select), date from/to.
- **New files** (3 total):
  - `src/app/logs/layout.tsx` — server layout; calls `requireActiveMembership()`, redirects non-ADMINs to `/digital-twin`. Mirrors `admin/layout.tsx` pattern.
  - `src/app/api/logs/route.ts` — `GET /api/logs`. Auth: `requireRole(['ADMIN'])`. Query params: `actorEmail`, `action`, `department`, `dateFrom`, `dateTo`, `auditOnly` (boolean), `page`, `limit` (max 100). When `auditOnly=true`, overrides `action` filter with `{ $in: AUDIT_ACTIONS }`. Returns `{ logs, total, page, limit, pages }`. `AUDIT_ACTIONS` = member.approve, member.revoke, member.update, architecture.share, architecture.delete, remediation.execute, invitation.send, invitation.revoke.
  - `src/app/logs/page.tsx` — client page. Two tabs: "Activity Feed" (cyan tab, all actions) and "Audit Log" (amber tab, `auditOnly=true`). Filter bar with Apply/Clear (applied vs draft pattern — apply is explicit, not instant). Per-action color coding in the log list. Pagination (prev/next, page counter). Empty state. Audit mode amber notice banner listing the preset actions. Action filter input is disabled + labelled "(preset)" in Audit mode.
- **Lint fix**: `fetchLogData` is a module-level pure async function (no setState), so calling it from `useEffect` doesn't trigger `react-hooks/set-state-in-effect`. All setState calls are in `.then()/.catch()/.finally()` chains. `setLoading(true)` is called in event handlers (handleApply, handleClear, switchView, goToPage) before triggering state changes that fire the effect. Initial `loading` state is `true` so the first render shows a spinner without a sync setState in effect.
- `tsc --noEmit` clean; `next build` clean (`ƒ /logs` and `ƒ /api/logs` appear); ESLint clean on all 3 files (no new lint errors).
- **Next unchecked tasks**:
  - Phase 1 follow-up: "Node Failure sim still reads healthy" — blocked on live backend + agent re-verification.
  - Phase 5 Task 4: Per-architecture log stream for Replay — surface a per-Architecture tab/filter showing that architecture's SimulationRun + ShadowRun + ActivityLog rows.

**2026-08-30 — Phase 1 follow-up: Node Failure sim reads healthy — root cause found and fixed (Claude)**
- **Root cause identified via backend audit**: `broadcast_node_status_changed` in `backend/routers/agents.py` (line 237) fires only when `effective_status != previous_status`. On the first heartbeat of any simulation, `online → simulating` transition fires the event — but all subsequent heartbeats keep `status = 'simulating'`, so the event never fires again. Health degradation during a multi-heartbeat `node_failure` (or `cpu_spike`/`memory_leak`) was never reaching the frontend. The `metrics.updated` event fires every heartbeat with raw `cpu_percent`/`memory_percent`/`disk_percent`, but the frontend handler was ignoring them.
- **Fix: `estimateHealthFromMetrics` added to `backendAdapters.ts`**: mirrors the backend `risk_engine.py` CPU/memory/disk component formulas (thresholds and weights). Dependency (0.20) and alert (0.10) weights are absent (those fields aren't in `metrics.updated`), so the remaining three weights are renormalized over their 0.70 total. For a full-spike simulation (all three metrics maxed), this correctly returns health ≈ 0 → classifies 'critical'. The function returns `null` when all three metrics are absent so callers can fall back to the last known score.
- **Fix: `metrics.updated` handler in `digital-twin/page.tsx` updated**: when `simulation_active` is true, calls `estimateHealthFromMetrics` and updates `healthScore` + `health` on the matching node. When not simulating, leaves both fields unchanged (trusts the last `status_changed` value, which correctly includes dependency/alert components we'd miss in the estimate). `classifyHealth` still applies — a simulating node with estimated health 0 reads 'unreachable' → 'critical' as expected.
- **Why not for non-simulating nodes**: non-simulation health degradation (e.g., CPU creeping above 70%) DOES trigger a `status_changed` (online → degraded transition), so the existing handler covers it. Only ongoing simulations skip that transition.
- **Verification**: `tsc --noEmit` clean; `next build` clean; ESLint shows 2 pre-existing errors (line 32 `any` in `DarkTooltip`, line 75 `set-state-in-effect` in `load()` effect) — both documented as known noise in the verification gate. No new errors introduced.
- **Files touched**: `src/lib/backendAdapters.ts` (new `estimateHealthFromMetrics` export), `src/app/digital-twin/page.tsx` (import + metrics.updated handler).
- **Next unchecked task**: Phase 5 Task 4 — "Per-architecture log stream for Replay." The backlog wants Replay's history accessible architecture-wise — a per-Architecture tab/filter showing that architecture's SimulationRun + ShadowRun + ActivityLog rows.

**2026-08-30 — Phase 5 Task 4: Per-architecture log stream for Replay (Claude)**
- **Task**: Surface a per-Architecture tab on the Replay page showing that architecture's SimulationRun + ShadowRun + ActivityLog rows.
- **Finding**: The implementation was already complete from a prior session that wasn't logged:
  - `src/app/simulation/replay/page.tsx` already had the "By Architecture" tab with full UI: arch picker, simulation-events list (loaded via `replayService.getArchitectureEvents`), and activity-log section (loaded via `replayService.getArchitectureActivity`). Clicking any event in the arch view shares the ghost-canvas viewer with the Global Timeline tab.
  - `src/services/replay.service.ts` already had `getArchitectureEvents(architectureId)` → `GET /api/simulation/history?architectureId=` and `getArchitectureActivity(architectureId)` → `GET /api/architectures/[id]/activity`.
  - `GET /api/simulation/history` already accepted an `?architectureId=` query param to scope its results.
  - `GET /api/architectures/[id]/activity` (new route) already existed: auth-checks visibility, collects SimulationRun/ShadowRun ids for the architecture, queries ActivityLog where `targetId` is any of the architecture's own id or its simulation/shadow-run ids — returns newest-first, limit 200.
- **Bug fixed in this session**: `loadSnapshot` (an `async function` declaration) was called inside a `useEffect` above its declaration in the file — ESLint's react-hooks plugin flagged this as "accessed before declared." Fixed by moving `loadSnapshot` above both `useEffect` blocks that reference it.
- **Loading-state lint fix**: `setArchListLoading(true)` was called synchronously in the `useEffect` body (triggering `react-hooks/set-state-in-effect` error). Fixed by initializing `archListLoading` as `true` (starts in loading state) and removing the redundant sync setter — `finally(() => setArchListLoading(false))` in the fetch chain clears it after the first load.
- `tsc --noEmit` clean; `next build` clean; ESLint clean on all 4 files.
- **Next unchecked task**: Phase 6 Task 1 — `src/lib/llm/provider.ts` — Gemini primary, OpenAI fallback on error/timeout. Refactor existing `/api/nl/route.ts` onto it.

**2026-08-30 — Phase 6 Task 1: LLM provider with Gemini primary + OpenAI fallback (Claude)**
- **Task**: Build `src/lib/llm/provider.ts` — Gemini primary, OpenAI fallback on any error or timeout. Refactor `/api/nl/route.ts` onto it. Add `OPENAI_API_KEY` to `.env.local`.
- **SDK verification**: Inspected `.d.ts` files for both SDKs before writing any call:
  - Gemini (`@google/genai` v2.18): `ai.interactions.create({ model, system_instruction, input, response_format: { type: 'text', mime_type: 'application/json', schema } }, { timeout })`. Response type `GoogleGenAIInteraction` has `status: InteractionStatus_2` ("completed" | "failed" | etc.), `output_text?: string`, `errors?: Array<ErrorT>`. Timeout goes in the second (options) argument as `{ timeout }` (ms).
  - OpenAI (newly installed): `new OpenAI({ apiKey, timeout })` → `client.chat.completions.create({ model, messages, response_format: { type: 'json_schema', json_schema: { name, schema, strict } } })`. Response `ChatCompletion.choices[0].message.content: string | null`.
  - OpenAI `strict: false` used deliberately — the Zod-derived schema includes `$schema`/`$defs` which OpenAI's strict mode rejects; loose mode still guides the output.
- **`src/lib/llm/provider.ts`** (new): exports `LLMRequest`, `LLMResult` interfaces and `callLLM(req)`. Tries `callGemini` first when `GEMINI_API_KEY` is present; catches any error, logs it, and falls through to `callOpenAI`. If neither key is set, throws immediately. Models: `gemini-3.7-flash` / `gpt-4o-mini`. Default timeout 20s.
- **`src/app/api/nl/route.ts`** refactored: removed direct `GoogleGenAI` import; imports `callLLM` from `@/lib/llm/provider`. Early-return 500 now triggers only when *both* keys are absent. The Gemini call block replaced with a single `callLLM({...})` call; error handling and JSON parsing logic unchanged.
- **`.env.local`**: added `OPENAI_API_KEY=sk-proj-...` (the key was already present but commented as `OPEN_AI_API_KEY`; corrected the variable name and uncommented it). `openai` npm package installed (`npm install openai`).
- `tsc --noEmit` clean; `next build` clean; ESLint clean on both files.
- **Next unchecked task**: Phase 6 Task 2 — `/api/cab/report` (streaming) + `/api/cab/chat`, grounded in the real simulation result, architecture, and business metadata — replacing `cab.service.ts`'s canned paragraph.

**2026-08-30 — Phase 6 Task 2: /api/cab/report (streaming) + /api/cab/chat (Claude)**
- **Task**: Replace `cab.service.ts`'s canned paragraph with real LLM-grounded CAB briefings using real SimulationRun + Architecture + NodeBusinessMeta data.
- **New `src/types/cab.ts`**: Added `CABReportMeta` interface — the structured payload emitted as the `metadata` SSE event before the streaming text starts. Fields: decision, confidence, riskScore, complianceTags, blastRadiusSummary, rollbackSteps, totalRevenueAtRisk, architectureName, targetNode.
- **New `src/app/api/cab/report/route.ts`**: POST, SSE streaming, nodejs runtime.
  - Auth: `getCurrentMembership` + 403 (any ACTIVE member).
  - Context resolution: uses `simulationRunId` from body if provided; otherwise falls back to most recent SimulationRun across user's accessible architectures (same $or visibility clause as `/api/architectures`). If `architectureId` only, loads the most recent SimulationRun for that architecture.
  - Loads `NodeBusinessMeta` for all blast-radius nodes + target node. Computes `totalRevenueAtRisk = sum(revenuePerHour × projectedDowntime)`.
  - Calls `callLLM` (Gemini → OpenAI fallback) with 45s timeout and a Zod-derived JSON schema: `{ decision, confidence, complianceTags, changeSummary, blastRadiusSummary, rollbackSteps[], fullText }`.
  - SSE stream: `event: metadata` → `CABReportMeta` JSON; then `event: token` → `{ t: "word " }` at ~18ms/word; then `event: done`. Any error sends `event: error → { message }`.
  - All lean doc shapes typed explicitly (`SimRunLean`, `ArchLean`, `BusinessMetaLean`) — same pattern as `/api/simulation/history`.
- **New `src/app/api/cab/chat/route.ts`**: POST, returns `{ reply: string }`, nodejs runtime.
  - Same auth + context resolution. Builds a context summary (arch name, sim type, risk score, downtime, blast count, business processes) as the system prompt background.
  - Accepts `history: {role, text}[]` in body; flattens last 10 turns into the user message (Human:/AI: prefix format) for single-turn callLLM multi-turn simulation.
  - LLM schema: `{ reply: string }`.
- **Updated `src/services/cab.service.ts`**:
  - `generateReport(context, onToken, onMeta?)` — does streaming fetch, parses SSE events, calls `onMeta` on `metadata` event and `onToken` on `token` events.
  - `chat(context, message, history)` — POST to `/api/cab/chat`, returns the reply string. Context + history passed in body.
  - `getRevenueImpact(totalRevenueAtRisk, projectedDowntime)` — now a pure sync function (no API call) that derives a 4-bucket time-bucketed chart from the known total. Phase 6 Task 3 replaces this with a real `/api/cab/revenue` route.
  - `RevenueImpact` type and `CABContext` interface exported from the service.
- **Updated `src/app/simulation/cab-copilot/page.tsx`**:
  - `useSearchParams` reads `?runId=` and `?archId=` so results/replay pages can link directly to a specific simulation's CAB view (the routes fall back to most-recent if no params).
  - `reportMeta: CABReportMeta | null` state drives: decision banner color+text, confidence %, risk score tile + color, compliance framework badges, blast radius paragraph, rollback step list.
  - `revenueData` is pure derived computation (`cabService.getRevenueImpact`) — no state, no effect — eliminating the react-hooks/set-state-in-effect lint error.
  - Decision banner: dynamic color/text from `decision` field (emerald/amber/orange/crimson).
  - Chat: passes `chatHistory` + `context` to `cabService.chat` so the LLM has multi-turn context.
  - Page wrapped in `<Suspense>` (required by Next.js App Router for `useSearchParams` in client component).
  - `generateError` + `chatError` inline error states replace silent failures.
  - Pre-generate state shows empty/prompt text instead of hardcoded static values.
- Files touched: `src/types/cab.ts`, `src/app/api/cab/report/route.ts` (new), `src/app/api/cab/chat/route.ts` (new), `src/services/cab.service.ts`, `src/app/simulation/cab-copilot/page.tsx`.
- `tsc --noEmit` clean; `next build` clean (new routes appear as `ƒ /api/cab/chat` and `ƒ /api/cab/report`); ESLint clean on all 5 files.
- **Next unchecked task**: Phase 6 Task 3 — Revenue-exposure chart from `NodeBusinessMeta` × blast radius × projected downtime (real per-bucket API route replacing the derived approximation in `getRevenueImpact`).

**2026-08-30 — Phase 6 Task 3: Revenue-exposure chart from NodeBusinessMeta × blast radius × projected downtime (Claude)**
- **Task**: Replace `cab.service.ts`'s sync `getRevenueImpact` approximation with a real API route that computes per-node revenue exposure from stored `NodeBusinessMeta` × blast radius × `projectedDowntime`.
- **New `src/app/api/cab/revenue/route.ts`** — `GET /api/cab/revenue?runId=&archId=`:
  - Auth: `getCurrentMembership` + 403 (any ACTIVE member).
  - Same SimulationRun resolution logic as `/api/cab/report`: resolves from `runId`, falls back to `archId`, falls back to most-recent accessible SimulationRun.
  - Access-checks the Architecture with the same `$or` visibility clause (own | sharedWith | department).
  - Fetches all blast-radius node keys + targetNodeId from `NodeBusinessMeta`.
  - **Per-node**: `revenueAtRisk = revenuePerHour × projectedDowntime`. Returns `nodeKey`, `nodeLabel`, `nodeType`, `revenuePerHour`, `revenueAtRisk`, `slaTier`, `criticality`, `businessProcesses`.
  - **`slaExposure`**: per-hour SLA penalty rate across all impacted nodes using tier-weighted rates (platinum 30%, gold 20%, silver 10%, bronze 5%). This is a per-hour figure matching the "/ hr" label in the UI.
  - **`chart`**: four cumulative time buckets (0–2h, 2–4h, 4–8h, 8h+) derived from the actual `projectedDowntime` so bars reflect where exposure accrues — buckets beyond the downtime render $0. Empty buckets filtered out.
  - Returns `{ total, slaExposure, projectedDowntime, chart, nodes }`.
- **Updated `src/services/cab.service.ts`**:
  - Removed sync `getRevenueImpact(total, downtime)` approximation entirely.
  - Added async `fetchRevenueImpact(context: CABContext): Promise<RevenueData | null>` — `GET /api/cab/revenue`, returns `null` on any error (no run yet, no metadata, 404) so callers degrade gracefully.
  - Exported `RevenueData` and `RevenueNode` interfaces for the page and future consumers.
  - `RevenueImpact` (the chart row type) kept as `{ timeBucket, revenueAtRisk }` to match the BarChart's `dataKey` expectations.
- **Updated `src/app/simulation/cab-copilot/page.tsx`**:
  - `revenueData` is now `useState<RevenueData | null>(null)` + `revenueLoading = true` initially.
  - `useEffect` on `[simulationRunId, architectureId]` calls `cabService.fetchRevenueImpact` in a `.then/.catch/.finally` chain — no sync `setState` in effect body, so no `react-hooks/set-state-in-effect` error.
  - Revenue panel: shows `Loader2` spinner while loading; shows "--" with "No NodeBusinessMeta configured yet" hint when data returns $0; shows real figures when configured. Chart shows spinner while loading, "No revenue data" empty state if no chart data.
  - `Loader2` imported from `lucide-react`; `RevenueData` imported from the service.
  - Revenue data loads on page mount independently of clicking "Generate Report" — if a `?runId=` param is in the URL, the chart is already populated when the page opens.
- Files touched: `src/app/api/cab/revenue/route.ts` (new), `src/services/cab.service.ts`, `src/app/simulation/cab-copilot/page.tsx`.
- `tsc --noEmit` clean; `next build` clean (`ƒ /api/cab/revenue` appears); ESLint clean on all 3 files.
- **Next unchecked tasks**:
  - Phase 6 Task 4: **Chat persistence** — `ChatSession`/`ChatMessage` Mongo models keyed by session + user, used by both CAB chat and the digital-twin MCP chat (Phase 7). Build generic from the start, not CAB-only.

**2026-08-30 — Phase 6 Task 4: Chat persistence — ChatSession/ChatMessage models + API routes + CAB wiring (Claude)**
- **Task**: Add `ChatSession`/`ChatMessage` Mongo models keyed by (user × sessionType × contextKey), generic enough for both CAB (Phase 6) and MCP chat (Phase 7). Wire persistence into the CAB Co-Pilot page.
- **New `src/lib/models/ChatSession.ts`**:
  - Fields: `clerkUserId` (indexed), `userEmail`, `sessionType` ('cab' | 'mcp' | 'general', enum), `contextKey` (string, e.g. `'simulation_run:<id>'` | `'architecture:<id>'` | `'none'`), `title` (nullable), timestamps.
  - Unique compound index on `(clerkUserId, sessionType, contextKey)` — enables upsert-by-context with no nullable subdocument index quirks.
  - `CHAT_SESSION_TYPES` const array exported for server-side validation.
- **New `src/lib/models/ChatMessage.ts`**:
  - Fields: `sessionId` (ObjectId ref ChatSession, indexed), `role` ('user' | 'assistant'), `content`, timestamps.
  - `role` follows OpenAI/Anthropic convention so history can be forwarded to LLMs without remapping.
- **New `POST /api/chat/sessions`**: creates or resumes a session (idempotent upsert via `$setOnInsert`). Auth: any ACTIVE member.
- **New `GET /api/chat/sessions/[id]`**: returns `{ session, messages[] }` in chronological order. Ownership-checked (clerkUserId must match).
- **New `POST /api/chat/sessions/[id]/messages`**: appends a batch of messages in one request (CAB batches user + assistant reply together to preserve order). Ownership-checked.
- **Updated `src/services/cab.service.ts`**:
  - Added `PersistedMessage` interface (role: 'user' | 'assistant', content, _id, createdAt).
  - `ensureChatSession({ sessionType, contextKey?, title? })` → POST /api/chat/sessions → session id string.
  - `getSessionMessages(sessionId)` → GET /api/chat/sessions/[id] → `PersistedMessage[]` (returns [] on any error).
  - `appendMessages(sessionId, messages)` → POST /api/chat/sessions/[id]/messages → void (caller ignores errors).
- **Updated `src/app/simulation/cab-copilot/page.tsx`**:
  - `sessionId: string | null` state (null until resolved).
  - New `useEffect` on `[simulationRunId, architectureId]`: derives `contextKey`, calls `ensureChatSession`, then `getSessionMessages`, maps `assistant → 'ai'` for local `chatHistory` state, restores any prior messages. Fire-and-forget on error so a session failure never blocks the page.
  - `handleChat`: after a successful LLM reply, calls `appendMessages(sessionId, [{role:'user',...}, {role:'assistant',...}])` fire-and-forget. A persistence hiccup never blocks the conversation.
  - The session useEffect does not call `setChatHistory([])` on entry — if the fetch fails, existing local state is preserved rather than wiped.
- **Lint note**: the new session `useEffect` calls `setChatHistory` only inside a `.then()` chain (not synchronously in the effect body) — no `react-hooks/set-state-in-effect` violation.
- `tsc --noEmit` clean; `next build` clean (new routes appear as `ƒ /api/chat/sessions`, `ƒ /api/chat/sessions/[id]`, `ƒ /api/chat/sessions/[id]/messages`); ESLint clean on all 7 changed files.
- **Next unchecked task**: Phase 7 Task 1 — View controls (layout preset, node-size metric, color mode, edge-label toggle, legend toggle, fullscreen), persisted per user.

**2026-08-30 — Phase 7 Task 1: View controls (layout preset, node-size, color mode, edge labels, legend, fullscreen) — persisted per user (Claude)**
- **Task**: Add view controls to the Digital Twin canvas — layout preset (TB/LR/circular), node-size mode (compact/normal/expanded), color mode (health/type), edge-label toggle, legend toggle, fullscreen — all persisted per user in MongoDB.
- **New `src/lib/models/UserPreferences.ts`**: Mongoose model with `clerkUserId` (unique index), `layoutPreset` ('TB'|'LR'|'circular', default 'TB'), `nodeSizeMode` ('compact'|'normal'|'expanded', default 'normal'), `colorMode` ('health'|'type', default 'type'), `showEdgeLabels` (bool, default false), `showLegend` (bool, default false). Constants (`LAYOUT_PRESETS`, `NODE_SIZE_MODES`, `COLOR_MODES`) exported alongside model — no mongoose import so safe for client bundles.
- **New `src/app/api/user/preferences/route.ts`**: `GET /api/user/preferences` returns saved prefs or defaults; `PUT` upserts only the fields present in the body (validates each field against the constant arrays). Auth: `getCurrentMembership()`, any ACTIVE member.
- **Updated `src/lib/graph/layout.ts`**: Added `layoutCircular(nodes, options)` — computes radius from `n × nodeSize × 1.5 / (2π)` (min 200px) so nodes don't overlap at any fleet size, positions evenly starting from top (−π/2 offset).
- **Updated `src/components/graph/GraphNode.tsx`**: Added `colorMode` and `nodeSizeMode` to `GraphNodeRenderData`. In health mode the badge border/background/icon tracks `HEALTH_COLORS[health]` instead of `typeColor`; in type mode (default) stays as before. `nodeSizeMode` applies a 0.65×/1.0×/1.45× multiplier to the dependency-count-based `sizePx` formula.
- **Updated `src/components/graph/FlowCanvas.tsx`**: New props `colorMode`, `nodeSizeMode`, `showEdgeLabels`, `showLegend`, `layoutPreset` (all optional with safe defaults). `toFlowNode` passes `colorMode`+`nodeSizeMode` to each node's render data. `toFlowEdge` conditionally includes/excludes the edge `label`, `labelStyle`, `labelBgStyle` based on `showEdgeLabels`. Legend overlay (`CanvasLegend` component) rendered when `showLegend` is true — shows NODE_TYPE_CATEGORIES in type mode, HEALTH_COLORS buckets in health mode. Auto-relayout when `layoutPreset` changes (using `useRef` to skip initial mount). `handleRelayout` button respects current preset (TB dagre / LR dagre / circular). `fromFlowNode` simplified to avoid unused-var lint issues — spreads all data including render-only fields (harmless under structural typing). Imports `layoutCircular` from layout.ts and `NODE_TYPE_CATEGORIES` from nodeTypes.ts.
- **New `src/components/graph/ViewControlsBar.tsx`**: Thin `'use client'` toolbar component. Layout buttons (AlignStartVertical/TB, AlignStartHorizontal/LR, Circle/Circ), Size buttons (S/M/L), Color buttons (Type/Health), toggle buttons (Labels, Legend), fullscreen button (Maximize2). Active state highlighted cyan. Separator dividers between groups. Fullscreen button right-aligned via `ml-auto`.
- **Updated `src/app/digital-twin/page.tsx`**: Adds `layoutPreset`, `nodeSizeMode`, `colorMode`, `showEdgeLabels`, `showLegend` state (defaults; overwritten by GET /api/user/preferences on mount). `prefsLoaded` ref prevents the auto-save effect from firing before the initial load resolves. Auto-save effect (PUT /api/user/preferences) fires on any pref change after load. Fullscreen: `graphContainerRef` on the graph container div, `handleFullscreen` toggles `requestFullscreen`/`exitFullscreen`, `fullscreenchange` event listener syncs `isFullscreen` badge in the toolbar. `<ViewControlsBar>` rendered as a new row between the top toolbar and `<GraphFilterBar>`. All five view props forwarded to `<FlowCanvas>`.
- **Lint/build**: `tsc --noEmit` clean; `next build` clean (`ƒ /api/user/preferences` appears). ESLint on all 7 changed files shows only 2 pre-existing errors on `digital-twin/page.tsx` (DarkTooltip `any` + `set-state-in-effect` on `load()`) — both documented in the verification gate. Zero new errors.
- **Next unchecked task**: Phase 7 Task 2 — Location-hierarchy filter dropdowns (region/building/room). First check what location fields live FastAPI nodes and mock topology actually carry, then add cascading dropdowns to `GraphFilterBar.tsx`.

**2026-08-30 — Phase 7 Task 2: Location-hierarchy filter dropdowns (Claude)**
- **Data audit findings**: The backend `/fleet/graph` `GraphNode` schema has NO `location` field — only `node_id`, `name`, `type`, `status`, `health_score`. The `/nodes` list endpoint (`BackendNodeListItem`) does carry `location: string | null` but this is a single free-form string (not structured as region/building/room). The mock graph (`mockGraph.ts`) had no location fields at all. No building/room hierarchy exists anywhere in current data.
- **What was implemented** (matching what the data supports):
  - Added `region` to all 17 nodes in `mockGraph.ts` with 3 realistic Waters-context values: `"Building A / DC"` (core datacenter — servers, databases, VMware, AD, storage), `"Lab Wing B"` (lab applications — Empower, NuGenesis, UNIFI, Citrix, IIS, Wildfly, Tomcat), `"Network Core"` (network devices and monitoring — LNDDevices, LACENodes, SolarWinds Feed).
  - `GraphFilterBar.tsx` — added `availableRegions: string[]`, `activeRegions: Set<string>`, `onToggleRegion(region: string)` props. Added a "Location" filter row (MapPin icon) that renders only when `availableRegions.length > 0` — so the row is hidden on live fleet where no nodes carry `region`. Region chips use violet accent to distinguish from the cyan department chips.
  - `digital-twin/page.tsx` — added `activeRegions` state, `toggleRegion` callback, `availableRegions` derived memo (sorted unique `node.region` values), `clearFilters` extended to also clear regions, `filteredNodes` extended with `activeRegions` check. All new props forwarded to `<GraphFilterBar>`.
- **Gap noted**: Live backend nodes from `/fleet/graph` will not show the Location filter because the backend `GraphNode` schema doesn't include `location`. The `/nodes` list does have it — future enrichment path: after fetching the fleet graph, cross-reference with `GET /nodes` to populate `region` on each `GraphNode` by matching `node_id`. That's an extra N-or-1 fetch and is deferred. Building/room cascading is a further step after that, requiring the backend to adopt a structured location schema (e.g. `location_region`/`location_building`/`location_room` fields) rather than the current free-form string.
- `tsc --noEmit` clean; `next build` clean; ESLint on all 3 changed files shows 2 pre-existing errors on `digital-twin/page.tsx` (DarkTooltip `any` + `set-state-in-effect` on `load()`) — both documented in the verification gate. Zero new errors.
- **Files touched**: `src/lib/mockData/mockGraph.ts`, `src/components/graph/GraphFilterBar.tsx`, `src/app/digital-twin/page.tsx`.
- **Next unchecked task**: Phase 7 Task 3 — "Chat UI, unblocked now; n8n wiring stays blocked." Build the floating chat panel + `POST /api/chat/mcp` route, backed by ChatSession/ChatMessage persistence and LLM provider from Phase 6.

**2026-08-30 — Phase 7 Task 3: Floating MCP chat panel + /api/chat/mcp route (Claude)**
- **Task**: Build a floating chat panel on the Digital Twin page and a backing POST /api/chat/mcp route, grounded in live fleet context, using Phase 6's LLM provider and Phase 6's ChatSession/ChatMessage persistence.
- **New `src/app/api/chat/mcp/route.ts`** (POST, nodejs runtime):
  - Auth: `getCurrentMembership()` + 403 (any ACTIVE member).
  - Body: `{ message, history?, nodesSummary? }` — client passes a compact fleet summary (total, healthy, degraded, critical, offline, simulating, types[], atRisk[], criticalLabels[]).
  - n8n path: if `N8N_WEBHOOK_URL` env var is set, forwards the request to that webhook (which fronts FastAPI's /mcp server) and returns its reply. Falls back to direct LLM if n8n fails.
  - Direct LLM path: `callLLM` (Gemini → OpenAI fallback) with a `{ reply: string }` Zod schema. System prompt is grounded in the fleet context summary passed from the client.
  - History: last 10 turns flattened into the user message (same pattern as /api/cab/chat).
- **New `src/components/graph/MCPChatPanel.tsx`** (client component):
  - Fixed-position, bottom-right (z-50). Collapsed: circular cyan button with MessageSquare icon. Expanded: 380×500 floating panel.
  - On first open: POST /api/chat/sessions (sessionType='mcp', contextKey='mcp:live') to create/resume a persistent session, then GET /api/chat/sessions/[id] to restore prior messages.
  - Send: calls /api/chat/mcp with message + history + nodesSummary (derived from the live `nodes` prop via `buildNodesSummary`). After reply, fire-and-forget POST /api/chat/sessions/[id]/messages to persist the turn.
  - UI: auto-scroll to bottom, Enter-to-send (Shift+Enter for newline), Loader2 "Thinking..." indicator, inline error display, empty-state prompt text.
  - No setState called synchronously in any useEffect body — `sessionInitiated` ref prevents double-init.
- **Updated `src/app/digital-twin/page.tsx`**: Added `MCPChatPanel` import and `<MCPChatPanel nodes={nodes} />` before the closing fragment. Passes the full (unfiltered) `nodes` array so the fleet summary always covers all nodes, not just what's visible on-screen.
- **n8n wiring**: left unchecked as instructed — the route checks `process.env.N8N_WEBHOOK_URL` at call time. To activate it, set that env var to the n8n webhook URL. No code change needed.
- `tsc --noEmit` clean; `next build` clean (`ƒ /api/chat/mcp` appears); ESLint clean on both new files. The 2 pre-existing errors on `digital-twin/page.tsx` (line 91 `load()` in effect + DarkTooltip `any`) are documented in the verification gate and pre-date this task.
- **Files touched**: `src/app/api/chat/mcp/route.ts` (new), `src/components/graph/MCPChatPanel.tsx` (new), `src/app/digital-twin/page.tsx` (import + panel mount).
- **Phase 7 Task 3 checkbox**: can now be ticked — the n8n sub-bullet stays unchecked per the task text.
- **Next unchecked task**: Phase 8 Task 1 — Extend nodeTypes.ts config with `actions[]` per type.

**2026-08-30 — Phase 8 Task 1: Extend nodeTypes.ts config with actions[] per type (Claude)**
- **Task**: Add a typed `actions[]` palette to every entry in `nodeTypeConfig` so Phase 8 Task 2 (NodeWorkProfile) and Task 3 (execution + ActivityLog) have stable action IDs to reference.
- **New interfaces in `src/lib/graph/nodeTypes.ts`**:
  - `NodeActionCategory = 'diagnostic' | 'maintenance' | 'emergency'` — drives icon/colour in the future actions UI.
  - `NodeAction { id, label, description, category, requiresConfirmation? }` — `id` is a stable dot-notation string (e.g. `'server.diag.ping'`) that Phase 8 Task 2's `NodeWorkProfile` will reference to customise per-node palettes.
  - `NodeTypeConfig` extended with `actions: NodeAction[]` (required field).
- **Actions per type** — Waters-context-appropriate 4–7 actions per category:
  - `server`: ping, view logs, list processes, restart services, apply patches, flush cache, emergency reboot
  - `database`: check connections, running queries, replication lag, backup, vacuum/optimize, export schema, kill long queries
  - `application`: health endpoint, app logs, thread/heap dump, restart, clear cache, deploy build, force-kill
  - `network_device / switch / device / loadbalancer`: ping sweep, routing table, traffic stats, reset port, flush ARP, failover (LB gets drain-backend instead of reset-port)
  - `firewall`: audit rules, show blocked IPs, traffic stats, export log, test rule, block IP range
  - `directory_auth`: check AD replication, audit permissions, test LDAP, force user sync, reset LDAP cache, lock account
  - `virtualization_host / vm`: list VMs, check resource allocation, cluster health, snapshot all, live migrate, emergency evacuate
  - `storage`: check capacity, integrity check, list volumes, trigger backup, unmount volume, emergency scrub
  - `monitoring_source`: review alert rules, test connectivity, spot-check metrics, sync metric config, clear alert queue, acknowledge all alerts
  - `cloud`: check quotas, list instances, review costs, restart instance, snapshot volumes
  - `container`: view logs, inspect state, show events, restart, scale replicas, force-kill
  - `infrastructure`: ping, view logs, restart services, emergency reboot
- **Consumer compatibility**: all existing consumers (`GraphNode.tsx`, `NodeInspector.tsx`, `GraphFilterBar.tsx`) only destructure `icon`/`color`/`label` — they ignore `actions` and type-check cleanly with the new required field.
- `tsc --noEmit` clean; `next build` clean; ESLint clean on `nodeTypes.ts`.
- **Next unchecked task**: Phase 8 Task 2 — `NodeWorkProfile` Mongo model so each node's available work is customisable, not fixed.

**2026-08-30 — Phase 8 Task 2: NodeWorkProfile Mongo model (Claude)**
- **Task**: Create the `NodeWorkProfile` Mongo model so each node's available action palette is customizable per node instance, not fixed to the type defaults.
- **New `src/lib/nodeWorkProfile/constants.ts`**: Mongoose-free constants file exporting `NODE_ACTION_CATEGORIES = ['diagnostic', 'maintenance', 'emergency'] as const` and the `NodeActionCategory` type. Safe for client bundle import without dragging Mongoose in.
- **New `src/lib/models/NodeWorkProfile.ts`**: Mongoose model with:
  - `nodeKey: string` (unique, required, indexed) — same identifier as NodeBusinessMeta.nodeKey and GraphNode.id, so business meta and work profile look up the same way.
  - `enabledActionIds: string[]` (default []) — subset of the node type's default action IDs from `nodeTypeConfig`. Empty = show all type defaults (no override applied). Non-empty = show only these IDs from the type defaults.
  - `customActions: [{ id, label, description, category, requiresConfirmation }]` (default []) — operator-defined actions not in the type palette, stored as inline subdocuments (`_id: false`). IDs should follow the same dot-notation convention (e.g. `'chromatograph.lab.run_batch'`) for consistent ActivityLog keying in Phase 8 Task 3.
  - timestamps. Hot-reload guard (`models.NodeWorkProfile ?? model(...)`).
- **New `src/lib/graph/workProfile.ts`**: Client-safe helper (no mongoose import). `getEffectiveActions(nodeType, profile)` merges type defaults with profile overrides — if profile is null or enabledActionIds is empty, returns all type defaults + any custom actions; if enabledActionIds is set, filters to those IDs + appends custom actions. `WorkProfileLean` interface exported for callers.
- **New `src/app/api/node-work-profile/route.ts`** (`GET ?nodeKey=X` / `PUT`):
  - GET: any ACTIVE member; returns `{ profile }` where profile is the stored doc or null (null = caller should use all type defaults).
  - PUT: ADMIN role required; validates and upserts `enabledActionIds` + `customActions`. Input-validates each custom action's category against `NODE_ACTION_CATEGORIES`.
- `tsc --noEmit` clean; `next build` clean (`ƒ /api/node-work-profile` appears); ESLint clean on all 4 files.
- **Next unchecked task**: Phase 8 Task 3 — Domain node types + actions. Render action palette inside existing `components/graph/panels/*`; executing an action writes an ActivityLog.

**2026-08-30 — Phase 8 Task 3: Domain node types + actions — action palette rendered in NodeInspector, ActivityLog wired (Claude)**
- **Task**: Render the per-node-type action palette (from Phase 8 Task 1's `nodeTypeConfig` actions[] + Phase 8 Task 2's `NodeWorkProfile` customisation) inside the node inspector, with inline confirmation and 4.5s feedback. Executing writes an ActivityLog row.
- **New `src/components/graph/panels/NodeActionsSection.tsx`** (client component):
  - Props: `node: GraphNode`. Self-contained — owns its own state and fetch.
  - On mount (and on node change): `Promise.resolve().then(...)` chain fetches `GET /api/node-work-profile?nodeKey=<node.id>`, then calls `getEffectiveActions(node.type, profile)` to merge type defaults with any per-node `NodeWorkProfile` overrides.
  - Groups actions by category — `diagnostic` (cyan, Stethoscope), `maintenance` (amber, Wrench), `emergency` (crimson, AlertTriangle) — in that fixed order.
  - Normal action: full-width button with label + hover tooltip showing `action.description`. Disabled while any action is executing.
  - `requiresConfirmation: true` actions: clicking the button opens an inline confirmation panel (label + description + Confirm/Cancel buttons) instead of firing immediately. A triangle warning icon on the button indicates confirmation is required.
  - Execute: `POST /api/node-actions/execute` with `{ nodeKey, actionId, actionLabel, nodeType }`. 4.5s success (emerald) or error (crimson) feedback banner appears below the action row.
  - Collapsible (chevron toggle, same pattern as Business Metadata in NodeInspector). Shows action count in header once loaded. Spinner while loading.
  - All `setState` calls inside `.then()/.catch()/.finally()` chains — no synchronous setState in the effect body — ESLint `react-hooks/set-state-in-effect` clean.
- **New `src/app/api/node-actions/execute/route.ts`** (POST, nodejs runtime):
  - Auth: `getCurrentMembership()` + 403 (any ACTIVE member).
  - Input validation: `nodeKey`, `actionId`, `actionLabel` must be non-empty strings; `nodeType` optional string.
  - Calls `logActivity({ action: 'node_action.execute', targetType: 'node', targetId: nodeKey, metadata: { actionId, actionLabel, nodeType }, actor: membership })`.
  - Returns `{ ok: true, message: "Action \"...\" executed on <nodeKey>" }`.
- **Updated `src/components/graph/NodeInspector.tsx`**:
  - Imports `NodeActionsSection` from panels directory.
  - Renders `<NodeActionsSection node={node} />` in a `border-t pt-4` wrapper, positioned between the Remediation Actions section and the Agent Credentials section.
- **Files touched**: `src/components/graph/panels/NodeActionsSection.tsx` (new), `src/app/api/node-actions/execute/route.ts` (new), `src/components/graph/NodeInspector.tsx` (import + mount).
- `tsc --noEmit` clean; `next build` clean (`ƒ /api/node-actions/execute` appears); ESLint clean on both new files. `NodeInspector.tsx` has 1 pre-existing `react-hooks/set-state-in-effect` error at line 149 (`load()`) — documented in verification gate, pre-dates this task.
- **Phase 8 complete.** All three tasks checked.
- **Next unchecked task**: Phase 9 Task 1 — Coherent flow: landing → sign-in → waiting-approval → digital-twin. Role-aware nav that hides Team/Logs from non-admins rather than redirecting after the click.

**2026-08-30 — Phase 9 Task 1: Coherent flow + role-aware nav (Claude)**
- **Task**: Coherent landing → sign-in → waiting-approval → digital-twin flow; role-aware nav hiding Team/Logs from non-ADMIN users.
- **New `src/app/api/auth/me/route.ts`** (`GET`, no auth required — returns graceful null for unauthenticated): calls `getCurrentMembership()`, returns `{ role, department, isAdmin }` or `{ role: null, department: null, isAdmin: false }`. Used by Navbar to gate admin-only links client-side without a page redirect.
- **Updated `src/lib/constants.ts`**: added `LOGS: '/logs'` to `ROUTES` so the new nav item uses the canonical constant.
- **Updated `src/components/layout/Navbar.tsx`**:
  - `BASE_SUB_NAV` holds the non-admin sub-nav items (Digital Twin / Node Health / Model Accuracy for the digital-twin section; Scenario Builder / Replay / Shadow Run / CAB Co-Pilot for the sim-lab section).
  - `ADMIN_ONLY_ITEMS = [{ label: 'Team', href: '/admin/team' }, { label: 'Logs', href: ROUTES.LOGS }]` — appended to the digital-twin sub-nav only when `isAdmin` is true.
  - `isAdmin` state (default `false`) set by a mount-time `useEffect` that fetches `GET /api/auth/me` and resolves `data.isAdmin`. Error is swallowed — network failures default to the safer non-admin view. setState only inside `.then()` — no `react-hooks/set-state-in-effect` violation introduced.
  - Removed the unused `Activity`, `Server` imports from the original. Removed `syncCounter` from the rendered output (kept the state for the future sync-indicator via `sr-only` span to avoid breaking the ticker logic, zero visual change).
  - Pre-existing `setTime` lint error on line 46 is unchanged — it was already called out by name in the verification gate ("Navbar") as pre-existing noise.
- **Updated `src/app/page.tsx`** (landing page):
  - Now calls `getCurrentMembership()` server-side (in addition to `auth()`), deriving `isActive` and `isPending` booleans.
  - **Header CTAs** — three states: (a) ACTIVE → "Mission Control" → `/digital-twin` + UserButton; (b) PENDING → "Awaiting Access" (amber) → `/waiting-approval` + UserButton; (c) unauthenticated → "Sign In" + "Get Started".
  - **Hero CTAs** — three states: (a) ACTIVE → "Enter Mission Control" → `/digital-twin`; (b) PENDING → "Check Access Status" (amber, Clock icon) → `/waiting-approval` + "An admin will activate your account shortly" hint; (c) unauthenticated → "Enter Mission Control" → `/sign-in` + "Request Access" → `/sign-up`. This closes the redirect loop where non-authenticated users clicking the hero CTA would land on `/digital-twin` and be bounced to `/sign-in` anyway.
  - Unescaped `"` entities in "what-if" description replaced with `&ldquo;`/`&rdquo;` to fix the one ESLint error introduced.
- `tsc --noEmit` clean; `next build` clean (`ƒ /api/auth/me` appears); ESLint: 0 new errors (1 pre-existing `setTime` error on Navbar documented in verification gate).
- **Files touched**: `src/lib/constants.ts`, `src/app/api/auth/me/route.ts` (new), `src/components/layout/Navbar.tsx`, `src/app/page.tsx`.
- **Next unchecked task**: Phase 9 Task 2 — Close the RBAC scoping gap: proxy browser → FastAPI graph/node calls through Next.js server routes that apply `getCurrentMembership()` department scoping before the response reaches the client.

**2026-08-30 — Phase 9 Task 2: Close the RBAC scoping gap — proxy graph/node data through Next.js with department scoping (Claude)**
- **Task**: `graph.service.ts` and `nodeHealth.service.ts` fetched FastAPI's `/fleet/graph`,
  `/fleet/summary`, `/nodes`, `/nodes/{id}`, `/nodes/{id}/metrics`, `/nodes/{id}/alerts` directly
  from the browser via `lib/axios.ts`, so `getCurrentMembership()` department scoping could never
  be applied — every ACTIVE member saw the entire fleet. Proxied all six calls through new Next.js
  routes that enforce scoping server-side before the response reaches the client.
- **The core problem**: FastAPI's node schema has no `department` field at all (confirmed during
  Phase 7 Task 2's location audit too) — there was nothing to scope *by*. Rather than inventing a
  new mapping model, added an optional `department: Department | null` field (default `null`) to
  the existing `NodeBusinessMeta` model (`nodeKey` → department), reusing the same per-node-key
  metadata record Phase 3 already built for revenue/SLA/criticality instead of a parallel one.
  `null`/untagged (the default for every node until an admin assigns one) means **unrestricted —
  visible to every department** — this is opt-in tagging, so no existing node silently vanishes
  from the fleet view for anyone. No UI was built to *set* this field in this task (out of scope —
  the task was about proxying + enforcing, not building an assignment UI); it currently has to be
  set by hand in Mongo (`db.nodebusinessmetas.updateOne({nodeKey}, {$set:{department:'...'}})`) or
  via a future admin route. Flagging this as the natural follow-up if department-restricted demo
  nodes are actually needed.
- **New `src/lib/graph/departmentScope.ts`**: `scopeNodeKeys(nodeKeys, membership)` → `Set<string>`
  of allowed keys (ADMIN department bypasses entirely, matching `requireDepartment`'s existing
  convention); `isNodeVisible(nodeKey, membership)` → boolean, for single-node routes.
- **New proxy routes** (all: `getCurrentMembership()` + 403, `cache: 'no-store'`, `NEXT_PUBLIC_API_TOKEN`/`NEXT_PUBLIC_API_BASE_URL` server-side — same `backendGet`-style fetch pattern
  `/api/simulation/analyze` and `/api/remediation/recommendations` already established):
  - `GET /api/fleet/graph` — filters `BackendFullGraph.nodes`/`.edges` by scope before returning.
  - `GET /api/fleet/summary` — **recomputes** `total_nodes`/`avg_health_score` from the
    department-scoped `/nodes` list rather than trusting the backend's fleet-wide summary
    (which would otherwise leak the true total to a scoped-out viewer). `online_nodes` /
    `offline_nodes` / `degraded_nodes` / `simulating_nodes` / alert counts are passed through
    unscoped from the backend — nothing in `nodeHealth.service.ts`'s `getSummary()` reads them
    today (only total + avg), so this is a documented approximation, not an active leak. Scoping
    those too would need a per-node alerts fetch this route doesn't otherwise require.
  - `GET /api/nodes` — filters the list by scope.
  - `GET /api/nodes/[id]` — 404s (not 403) when the node is scoped away, same response as
    "doesn't exist," so a scoped-out node's existence isn't leaked by status code.
  - `GET /api/nodes/[id]/metrics`, `GET /api/nodes/[id]/alerts` — same 404-on-scoped-out gate,
    proxy the `limit`/`active_only` query params through.
- **Updated `src/services/graph.service.ts`**: `getLiveGraph()` now calls `fetch('/api/fleet/graph')`
  instead of `api.get('/fleet/graph')`; `adaptFullGraph` still runs client-side unchanged (same
  `BackendFullGraph` shape crosses the proxy).
- **Updated `src/services/nodeHealth.service.ts`**: removed the `axios` import entirely — every
  call (`getSummary`, `getNodes`, `getNode`, `fetchNodeHealth`'s metrics+alerts fetch) now goes
  through a small local `fetchJson<T>(url)` helper against the `/api/...` proxy routes above.
- **Not touched (explicitly out of scope for this task)**: `nodeAdmin.service.ts`
  (`/agent/register`, `/nodes/{id}/credentials` — admin node-lifecycle actions, not "graph/node
  data" viewing, and already role-gated elsewhere) and `shadowRun.service.ts`'s `/fleet/summary`
  call (Simulation Lab feature, separate surface) still call FastAPI directly via `lib/axios.ts`.
  If department scoping is later wanted there too, the same `departmentScope.ts` helper applies
  directly — no new pattern needed.
- Ran `npm install` first — `dagre`/`openai` were in `package.json` (Phase 7/Phase 6 work) but not
  actually installed in `node_modules`, which was failing `tsc --noEmit` on unrelated files before
  any of this task's changes. Unrelated pre-existing environment drift, now resolved.
- `tsc --noEmit` clean; `next build` clean (all 6 new routes appear:
  `ƒ /api/fleet/graph`, `ƒ /api/fleet/summary`, `ƒ /api/nodes`, `ƒ /api/nodes/[id]`,
  `ƒ /api/nodes/[id]/alerts`, `ƒ /api/nodes/[id]/metrics`); ESLint clean on all 10 changed/new
  files (2 pre-existing unused-arg warnings on `nodeHealth.service.ts`'s stub `remediateNode`,
  unrelated to this task).
- **Files touched**: `src/lib/models/NodeBusinessMeta.ts`, `src/lib/graph/departmentScope.ts`
  (new), `src/app/api/fleet/graph/route.ts` (new), `src/app/api/fleet/summary/route.ts` (new),
  `src/app/api/nodes/route.ts` (new), `src/app/api/nodes/[id]/route.ts` (new),
  `src/app/api/nodes/[id]/metrics/route.ts` (new), `src/app/api/nodes/[id]/alerts/route.ts` (new),
  `src/services/graph.service.ts`, `src/services/nodeHealth.service.ts`.
- **Next unchecked task**: Phase 9 Task 3 — Revoke a pending team request directly, without
  approving first. Check `src/app/api/admin/members/[id]/route.ts` first for whether the existing
  revoke route already accepts a `PENDING` source status before assuming a new route is needed.

**2026-08-30 — Phase 9 Task 3: Revoke a pending team request directly (Claude)**
- **Task**: Add a Reject/Revoke action to `/admin/team`'s Pending Approvals table so an admin can
  decline a signup without approving it first.
- **Finding**: `DELETE /api/admin/members/[id]/route.ts` already sets `membership.status = 'REVOKED'`
  unconditionally — it never checks the current status first, so it already works from `PENDING`
  as well as `ACTIVE`. No new route was needed, per the task's own suggestion to check this first.
- **Change**: `src/app/admin/team/page.tsx` — added a "Reject" `Button` (danger variant, X icon)
  next to "Approve" in the Pending Approvals row, calling the same `revoke(p.membershipId)`
  handler already used by the Active Members table's Revoke button. Wrapped both buttons in a
  `flex items-center gap-2` div.
- `tsc --noEmit` clean; `next build` clean; `eslint src/app/admin/team/page.tsx` shows only the
  pre-existing `react-hooks/set-state-in-effect` error on the `load(debouncedSearch)` effect
  (line 88) — this predates the change and is documented as known noise in the verification gate;
  not touched by this task.
- **Files touched**: `src/app/admin/team/page.tsx`.
- **Phase 9 complete.** All three tasks checked.
- **Next unchecked task**: Phase 10 Task 1 — Define per-`NodeType` risk weighting in a new
  `lib/graph/riskWeighting.ts`.

**2026-08-30 — Phase 10 Task 1: Per-NodeType risk weighting module (Claude)**
- **Task**: Define per-`NodeType` risk weighting in a new `lib/graph/riskWeighting.ts` — a
  derived/display-layer computation only, not a change to backend risk computation.
- **New `src/lib/graph/riskWeighting.ts`**:
  - `NODE_TYPE_RISK_WEIGHT: Record<NodeType, number>` — multiplier per type, e.g.
    `directory_auth: 1.35`, `database: 1.3`, `firewall: 1.25`, `virtualization_host: 1.2`,
    `vm`/`storage: 1.15`, network-ish types `1.1`, `server`/`application: 1.05`,
    `cloud`/`container`/`infrastructure: 1.0`, `monitoring_source: 0.8` (observational, dampened).
  - `getRiskWeight(type)` — safe lookup with `1.0` fallback for any type not in the map.
  - `computeWeightedRisk(healthScore, type)` — takes the existing `GraphNode.healthScore` (0-100,
    higher = healthier), derives raw risk as `100 - healthScore`, multiplies by the type weight,
    clamps to `[0, 100]`, rounds to 2 decimals. Same input shape as
    `classifyHealth`/`estimateHealthFromMetrics` in `backendAdapters.ts` so callers don't need a
    new fetch — they already have `healthScore` and `type` on every `GraphNode`.
  - Not wired into any page yet — that's Phase 10 Task 2 (surfacing wherever raw risk currently
    displays: node-health page, at-risk lists, Phase 8 panels), left unchecked and deliberately
    not started this iteration so it stays its own reviewable unit.
- `tsc --noEmit` clean; `next build` clean; `eslint src/lib/graph/riskWeighting.ts` clean.
- **Files touched**: `src/lib/graph/riskWeighting.ts` (new).
- **Next unchecked task**: Phase 10 Task 2 — Surface the weighted score wherever raw risk
  currently displays (node-health page, at-risk lists, type-specific panels), clearly labeled so
  it isn't confused with the backend's raw `risk_score`.

**2026-08-30 — Phase 10 Task 2: Surface weighted risk score in the UI (Claude)**
- **Task**: Surface Phase 10 Task 1's `computeWeightedRisk`/`getRiskWeight` (in
  `lib/graph/riskWeighting.ts`) wherever raw risk/health currently displays, clearly labeled so
  it isn't confused with the backend's raw `risk_score`/`healthScore`.
- **Added `weightedRiskColor(weightedRisk)` to `riskWeighting.ts`** — shared color-banding helper
  (crimson ≥50, amber ≥20, emerald below) so the badge reads consistently across every surface
  below instead of three ad-hoc color computations.
- **`src/components/graph/NodeInspector.tsx`** — base section (used by every node type, under the
  HealthGauge) now shows a `TYPE-WEIGHTED RISK <n>` line, colored via `weightedRiskColor`, with a
  tooltip explaining it's derived (health score × node-type criticality), not the backend's raw
  `risk_score`. This single spot covers all Phase 8 type-specific panels too, since they render
  inside the same `NodeInspector` host below this shared header.
- **`src/app/digital-twin/page.tsx`** — Critical/Offline and At Risk side-panel lists: each row's
  existing raw `healthScore` now has a `W:<n>` weighted-risk figure appended, color-banded and
  tooltipped the same way, computed from that row's own `n.type`.
- **`src/components/nodes/NodeCard.tsx`** (node-health page grid) — added a `WEIGHTED RISK <n>`
  line under the health Badge, same color/tooltip convention.
- Deliberately did **not** change the node-health page's "risk" sort key (still sorts by raw
  `healthScore` ascending in `nodeHealth.service.ts`) — the task was about *display*, not
  re-ranking; changing sort order would silently change which nodes float to the top of an
  already-shipped page beyond what was asked.
- `tsc --noEmit` clean; `next build` clean; `eslint` on all 4 changed/touched files shows only
  pre-existing errors already documented in the verification gate's known-noise list
  (`react-hooks/set-state-in-effect` on `digital-twin/page.tsx:92` and
  `NodeInspector.tsx:150`) plus one pre-existing unused-var warning in `NodeCard.tsx`'s `UtilBar`
  (`label` prop, unrelated to this change) — no new lint errors introduced.
- **Files touched**: `src/lib/graph/riskWeighting.ts`, `src/components/graph/NodeInspector.tsx`,
  `src/app/digital-twin/page.tsx`, `src/components/nodes/NodeCard.tsx`.
- **Phase 10 complete.** All phases (0–10) now fully checked off in IMPLEMENTATION_PLAN.md.
  Remaining open items are all in **Backend backlog** (out of scope for this frontend loop) or the
  one Phase 1 follow-up already flagged as backend-only (heartbeat-timeout constant).

**2026-08-30 — No-op: all frontend phases complete (Claude)**
- Checked `IMPLEMENTATION_PLAN.md` for the first unchecked `- [ ]` task per the agent instructions.
  Only two unchecked boxes exist in the entire file (line 160: heartbeat-timeout constant; line 208:
  always-on background Shadow Run), and both are explicitly documented as backend-shaped work this
  frontend loop must not action, mirrored in the Backend backlog section.
- Phases 0–10 are otherwise fully checked off (confirmed by the 2026-08-30 Phase 10 Task 2 entry
  above: "All phases (0–10) now fully checked off in IMPLEMENTATION_PLAN.md").
- No code changes made this iteration. Nothing to verify against the gate.
- **Next step for a future agent**: the plan needs a new backlog refresh from the user (as the
  2026-08-29 note at the top of the plan describes) before there's frontend work to pick up again.

**2026-08-30 — Both remaining Backend backlog items done by hand, outside the Ralph loop (Claude)**
- The user asked directly (not via the Ralph loop) to close out the two flagged backend items.
  Heartbeat-timeout is genuinely `InfraMind.py` work (see that repo's `context/DEVELOPMENT_STATUS.md`
  2026-08-30 note: `OFFLINE_TIMEOUT_SECONDS` 60→10, offline-detector poll cadence 30s→5s). Line
  160 ticked in `IMPLEMENTATION_PLAN.md`.
- **Continuous background Shadow Run** turned out to have a frontend-reachable implementation after
  all — asked the user how they wanted the always-on piece built (standalone worker vs. host cron
  vs. FastAPI background task vs. defer); they chose **host/Vercel cron hitting a Next.js route**,
  which keeps every persistence/scoping rule in this repo's Mongo layer and needs no new process.
  Built:
  - `Architecture.continuousShadowRun` (bool, default false) — per-architecture opt-in, since most
    saved architectures are exploratory drafts nobody wants sampled forever.
  - `ShadowRun.triggeredBy` (`'user' | 'scheduler'`, enum in `lib/shadowRun/constants.ts`) — so the
    history tab can tell a manual "Run Shadow Sync" apart from an auto tick.
  - Extracted `computeRunResult` out of `shadowRun.service.ts` into `lib/shadowRun/divergence.ts`
    (pure, no I/O) so the manual button and the cron tick compute divergence from **one** formula
    instead of risking drift between two copies.
  - `GET /api/architectures/[id]` and `PATCH` now read/write `continuousShadowRun`; `PATCH` is
    owner-only like every other field on that route.
  - New `GET /api/cron/shadow-run` — finds every `continuousShadowRun:true` Architecture, fetches
    the live fleet graph once per tick (`adaptFullGraph` over FastAPI `/fleet/graph`, same adapter
    `api/fleet/graph/route.ts` already uses), runs `computeRunResult` per architecture, persists a
    `ShadowRun` with `triggeredBy:'scheduler'`. Gated by `Authorization: Bearer $CRON_SECRET` (no
    Clerk session exists on a cron-triggered request) — refuses everything if `CRON_SECRET` isn't
    set, rather than defaulting open. One architecture's failure is caught per-iteration so it can't
    take the rest of the tick down. Deliberately does **not** call `logActivity` per tick (no user
    actor to attribute it to, and a 5-minute cron would flood the audit log) — the `ShadowRun` rows
    are themselves the record.
  - `vercel.json` — `*/5 * * * *` schedule pointing at the route. Noted in `.env.local.example`
    that Vercel's Hobby plan only runs crons daily; a Pro plan or a self-hosted scheduler (anything
    that can hit an HTTPS URL with a header) is needed for real 5-minute ticks — the route itself
    doesn't care who calls it.
  - `CRON_SECRET` added to `.env.local` / `.env.local.example` (freshly generated random value, not
    a shared/third-party credential).
  - Shadow Run page (`app/simulation/shadow-run/page.tsx`): a "Background: On/Off" toggle next to
    Run Shadow Sync (PATCHes the new field), and an "AUTO" badge on history rows where
    `triggeredBy==='scheduler'` — without these the backend plumbing would have been unreachable
    from the UI.
  - `tsc --noEmit`, `next build`, and `eslint` on every touched/new file are all clean.
  - **Files touched**: `src/lib/models/Architecture.ts`, `src/lib/models/ShadowRun.ts`,
    `src/lib/shadowRun/constants.ts`, `src/lib/shadowRun/divergence.ts` (new),
    `src/services/shadowRun.service.ts`, `src/app/api/architectures/[id]/route.ts`,
    `src/app/api/shadow-runs/route.ts`, `src/app/api/cron/shadow-run/route.ts` (new),
    `src/app/simulation/shadow-run/page.tsx`, `vercel.json` (new), `.env.local*`.
  - Line 208 ticked in `IMPLEMENTATION_PLAN.md`; the Backend backlog entry for this item updated to
    point here instead of describing it as unactioned.
- **Pre-existing, unrelated to this session's changes**: `npx next dev` currently crashes at startup
  with `Error: You cannot use different slug names for the same dynamic path ('id' !== 'nodeKey')`
  — a conflict between `api/nodes/[id]/*` and `api/nodes/[nodeKey]/business-meta` (both untracked
  in git, presumably from a recent Ralph iteration). `next build` does **not** hit this and succeeds
  cleanly, so it didn't block verifying this session's work, but `next dev` is currently unusable
  until whichever of those two param names is wrong gets renamed to match. Flagging for the next
  loop iteration to fix — out of scope for this backend-focused session.
- **Not done**: no UI surfaced yet for *discovering* which architectures have background monitoring
  on globally (the toggle only shows once you've loaded that specific architecture into Shadow Run).
  Fine for now given it's opt-in per architecture and off by default, but worth a "N architectures
  under continuous watch" indicator somewhere if usage grows.

**2026-08-30 — Node Inspector: remove fake Load Spike button, real stop-simulation on remediation
execute, critical-alert red highlight (Claude)**
- User asked for three things on the Node Inspector (screenshots showed the Server type panel, the
  Remediation Actions list, and the actual `InfraMind Agent` PySide6 GUI for context):
  1. Remove the "⚡ Simulate: Load Spike" button.
  2. Executing a remediation action should actually stop a CPU-spike (or any) simulation currently
     running on that node's agent, with the agent's own GUI reflecting it going back to normal.
  3. Remediation Actions should show a red/crimson highlight when the node has a critical condition
     (matching the Active Alerts section's existing red treatment), the way the screenshot's CPU
     critical alert implied they should.
- **(1)** `components/graph/panels/ServerPanel.tsx` — removed the `SimulateButton` (label "Simulate:
  Load Spike") and its import. That button called `simulationService.analyzeScenario()` (a mocked
  "what-if" AI-copilot feature, `components/graph/panels/SimulateButton.tsx`) — unrelated to the real
  agent-side failure simulations shown in the screenshots, and confusing next to them. Left
  `SimulateButton.tsx` itself alone — still used by `NetworkDevicePanel.tsx` and `DatabasePanel.tsx`,
  which the user didn't ask to touch.
- **(2)** This turned out to need a real cross-repo feature, not just a frontend change — investigated
  the actual agent/backend architecture first (via a research subagent) rather than assuming a channel
  existed: there was **no** way for the backend to push anything to a running agent (no WebSocket
  client in the agent, `HeartbeatResponse` had only `received`+`alerts`, no flexible column on the
  `Node` table). Built the missing piece on the `InfraMind.py` side — full detail in that repo's
  `context/DEVELOPMENT_STATUS.md`, 2026-08-30 entry — summary: a new in-memory pending-command queue
  (`backend/services/pending_commands.py`), a new `POST /nodes/{id}/stop-simulation` (Bearer-protected,
  same convention as `/nodes/{id}/credentials`), `HeartbeatResponse.stop_simulation` relaying it on the
  node's next heartbeat, and `agent/core/heartbeat.py` calling `simulator.simulation_state.stop()` when
  it sees that flag (the exact same call the agent GUI's own Stop Simulation button makes — no new GUI
  wiring needed, since `main_window.py` already re-reads `simulation_active` from every heartbeat's
  metrics and updates the button highlighting from that). Verified live end-to-end against the running
  `Blrm` agent: queue → relay in the backend logs, one heartbeat cycle (~10s) apart.
  - `src/app/api/remediation/execute/route.ts` — after writing the existing ActivityLog receipt, now
    also fire-and-forget POSTs to the new backend endpoint (`queueStopSimulation()`), wrapped in
    try/catch so a missing agent or unreachable backend never fails the execute response — the
    ActivityLog row remains the guaranteed receipt; the stop-simulation call is a bonus real effect
    when a live agent happens to exist for that node.
- **(3)** `components/graph/NodeInspector.tsx` — derived `hasCriticalAlert` from
  `detail.alerts.some(a => a.severity === 'critical')` (same field the Active Alerts section already
  keys its own red styling off) and applied `bg-crimson/10 border-crimson/30` to every Remediation
  Actions card when true, `bg-brand-bg border-brand-border` otherwise. First attempt wrapped the whole
  block in an inline IIFE to scope the derived boolean — that tripped a *new* `react-hooks/refs` lint
  error ("Cannot access refs during render") on the unrelated `handleExecute` onClick a few lines down,
  confirmed via `git stash` that this error didn't exist before the IIFE. Fixed by hoisting
  `hasCriticalAlert` to a plain top-level derived `const` (same pattern as the existing `healthColor`
  line above it) instead — no IIFE, error gone, confirmed by re-diffing against the pre-change lint
  output that only the two already-documented pre-existing issues remain
  (`react-hooks/set-state-in-effect` at line 150, the `<img>` LCP warning).
- `tsc --noEmit`, `next build`, and `eslint` on every touched file are clean (module the two
  pre-existing issues above). Backend Python: `py_compile` clean on every touched file; the new
  endpoint and the full queue→relay chain were exercised live against the running docker-compose stack
  and the real agent (not just compiled) — see the `InfraMind.py` entry for the exact log lines.
- **Files touched (this repo)**: `src/components/graph/panels/ServerPanel.tsx`,
  `src/app/api/remediation/execute/route.ts`, `src/components/graph/NodeInspector.tsx`.
- **Not verified**: the actual PySide6 GUI visually updating (would require driving the desktop app
  directly, which wasn't done) — confirmed instead by reading `main_window.py`'s existing
  `_on_metrics`/`_set_active_sim_button` wiring, which already consumes `simulation_active` from every
  heartbeat's metrics dict, so no new GUI code was needed for it to pick up the change.
