# InfraMind Context

Append-only session log, **newest entries first**. Ralph iterations (per `.ralph/PROMPT.md`) read
only the top ~150 lines of this file, not the whole thing — keep new entries dense.

---

**2026-09-05 — Node Health: fixed invisible stat-card numbers (Claude)**
- `app/digital-twin/node-health/page.tsx`'s `SummaryCard` (the Total Nodes / Critical / At Risk / Healthy stat buttons) hardcoded the big number's color to `#fff` whenever the card wasn't the active filter — white text on the card's near-white `bg-brand-surface` background (`#FBF8F0`), effectively invisible. Changed the inactive-state color to `#2C2A22` (the same dark ink used elsewhere for text-on-light, e.g. `GraphNode.tsx`'s label). Active cards are unaffected (they already used the stat's own color).
- Verified: `tsc --noEmit` clean, `next build` clean, ESLint clean aside from two pre-existing issues on this same file (unused `Badge` import, `set-state-in-effect` on the initial load effect) — neither introduced by this change.

---

**2026-09-05 — Graph canvas contrast: quieter background grid, more solid node badges (Claude)**
- User-reported: "background grid seems dark and nodes seem lighter" — a contrast complaint, not a literal dark-mode bug (the canvas background is a fixed light cream, `#F4EEDF`, no `prefers-color-scheme` anywhere). Root cause was the `Background` grid using `BackgroundVariant.Lines` at a fairly saturated tan (`#DCCBA0`) drawn as full crossing lines every 40px — visually loud enough to read as "the busy/dark part" — while each node's badge disc behind its icon (`GraphNode.tsx`) was only a 15%-alpha tint of its own color, so nodes looked faint/washed out by comparison.
- `FlowCanvas.tsx` — switched the grid to `BackgroundVariant.Dots` (much quieter than full lines), `gap={28}`, `size={1.5}`, color faded to `#DCCBA088`.
- `GraphNode.tsx` — the badge disc behind each node's icon is now a solid near-white surface fill (`#FBF8F0`) with a crisp 2px border in the node's own color plus a small drop shadow, instead of a barely-visible tinted fill — nodes now read as solid "cards" sitting clearly on top of the quieter dotted backdrop.
- Verified: `tsc --noEmit` clean, `next build` clean, ESLint clean (pre-existing `no-img-element` warning only, not introduced here).

---

**2026-09-05 — CAB "Business Risk Exposure" still blank for most scenarios: added an architecture-wide baseline fallback (Claude)**
- Root cause: the two fallbacks added earlier (SimulationRun-based, then CabChecklistItem.revenueImpact-based) only cover a *specific incident* — a real simulation run or a "goes down" failure scenario. Any other scenario type (an OS upgrade, a migration, "Impact Analysis Request", etc.) has neither, so the route fell through to a flat $0/blank — even when the architecture's nodes are heavily revenue-tagged (verified live: the most recent "Windows 10 to 11 Upgrade" scenario has 16 of 22 nodes tagged, summing to $6,960/hr, yet showed nothing).
- Added a third, final fallback in `api/cab/revenue/route.ts`: when there's no incident-specific number to show, sum `revenuePerHour` across every `NodeBusinessMeta`-tagged node in the *whole architecture* — a "how much revenue rides on this architecture" baseline, not a specific-incident total. Deliberately no time-accrual chart for this tier (`chart: []`, `projectedDowntime: 0`) since there's no outage duration to accrue over; only genuinely-untagged architectures now fall through to the true $0 empty state.
- Verified against the live DB: the Windows 10/11 upgrade scenario would now return `total: 6960`, `slaExposure: 1810` instead of the previous all-zero payload.
- Verified: `tsc --noEmit` clean, `next build` clean, ESLint clean.

---

**2026-09-05 — Outage emails: dropped revenue-at-risk, reverted EMAIL_FROM to the unverified-domain-safe sender (Claude)**
- User asked to drop cost/revenue details from the outage alert email — removed `revenueAtRiskUsd` entirely: `outageEmailTemplate.ts`'s `OutageAlertContent` and the "Business impact" two-column card are gone (downtime alone now gets its own simple stat block), `sendOutageAlert.ts`'s `OutageAlertInput` no longer has the field, and all three callers (`api/shadow-runs`, `api/cron/shadow-run`, `api/simulation/analyze`) stopped passing it. `api/simulation/analyze`'s `computeRevenueAtRisk` call existed only to feed this email field, so it was removed outright rather than left dead.
- Separately: `aus1in.me` was set as `EMAIL_FROM`'s domain but isn't verified in Resend yet ("add and verify your domain" error, DNS verification takes time) — reverted `EMAIL_FROM` in both `.env.local` and `.env.local.example` back to `InfraMind Alerts <onboarding@resend.dev>` (Resend's shared, always-available test sender) so sending keeps working today; swap to an `aus1in.me` address once that domain shows "Verified" in the Resend dashboard. Note for whoever does that: `onboarding@resend.dev` can only deliver to the Resend account's own owner email — a verified custom domain is what unlocks sending to the actual configured recipient list.
- Verified: `tsc --noEmit` clean, `next build` clean, ESLint clean on all changed files.

---

**2026-09-05 — Outage Notifications: one-click demo email from the page header icon (Claude)**
- New `api/admin/notification-recipients/send-test` POST route (ADMIN-only) — fires `sendOutageAlertEmail()` with realistic sample data (a critical `oracle-nugenesis-db-milford` node, $3,600 revenue at risk, 3h downtime) so an admin can see exactly what recipients receive without waiting for a real Shadow Run/Node Failure trigger.
- `admin/notifications/page.tsx` — the Mail icon in the page header is now a button: click to send, spinner while sending, swaps to a Send icon on hover, and a result line underneath reports success (with recipient count/list) or failure. `RESEND_API_KEY`/`EMAIL_FROM` are now set in this environment, so this actually delivers.
- Verified: `tsc --noEmit` clean, `next build` clean (new route present), ESLint clean aside from the same pre-existing `react-hooks/set-state-in-effect` pattern noted in the entry below.

---

**2026-09-05 — Outage alert emails: Resend-based, sent on real "server down" triggers, admin-managed recipient list (Claude)**
- New `src/lib/models/NotificationRecipient.ts` — flat admin-managed list (`email`, `name`, `department` nullable, `active`). `department: null` = notified for every outage; a specific department = only outages on nodes NodeBusinessMeta-tagged with that department (same "null = unrestricted" convention NodeBusinessMeta.department already uses). `austinmiracle007@gmail.com` (`DEFAULT_OUTAGE_RECIPIENT` in `sendOutageAlert.ts`) is always included on every alert regardless of this list, per explicit ask.
- New `src/lib/notifications/outageEmailTemplate.ts` — hand-written, inline-styled, table-based HTML (email clients strip `<style>`/stylesheets) matching the app's brand palette: crimson alert header, affected-nodes table with health-color badges, revenue-at-risk/downtime callout when available, numbered recommended-actions list, "View in InfraMind" CTA. Also emits a plain-text fallback.
- New `src/lib/notifications/sendOutageAlert.ts` — `sendOutageAlertEmail()` via `resend` (new dep, `RESEND_API_KEY`/`EMAIL_FROM`/`NEXT_PUBLIC_APP_URL` added to `.env.local.example`, all optional — with no key set, sending no-ops and returns `{sent:false, error}` rather than throwing, so it can never break the caller). Every call site fires it as fire-and-forget (`void sendOutageAlertEmail(...)`, no `await` before responding) — an email provider issue must never fail a shadow run or simulation request.
- Wired to three real "system down" triggers: `api/shadow-runs` POST (manual Run Shadow Sync, when `criticalNodeIds` non-empty), `api/cron/shadow-run` (the scheduled tick, same condition), and `api/simulation/analyze` when `simulationType === 'node_failure'` specifically (the one simulation type that models an actual outage, not degradation) — reuses `computeRevenueAtRisk` (`lib/shadowRun/revenue.ts`) for the dollar figure shown in the email.
- New Admin → Notifications page (`app/admin/notifications/page.tsx`, gated by `app/admin/layout.tsx`'s ADMIN-only layout) + `api/admin/notification-recipients` (GET/POST) and `.../[id]` (PATCH/DELETE) routes, following `admin/team/page.tsx`'s exact conventions (Card/CardHeader/Button/selectClass/table). Added to `Navbar.tsx`'s `ADMIN_ONLY_ITEMS` sub-nav.
- Note: a concurrent Ralph-loop change added an unrelated-but-adjacent `IssueContact` model + `/admin/contacts` page — a chatbot-facing escalation directory ("if X breaks, tell the MCP chat agent to name contact Y"), not an email sender. No overlap/conflict — verified both coexist in the same `next build`.
- Verified: `tsc --noEmit` clean, `next build` clean (both admin pages/routes present), ESLint clean except the same pre-existing `react-hooks/set-state-in-effect` pattern `admin/team/page.tsx` already has (not introduced here, not worth deviating from the established convention to silence).

Entries older than 2026-09-03 (all of Phases 0-10's completion logs — those phases are fully done;
see `IMPLEMENTATION_PLAN.md`'s "Already done" table and Ground Rules for the durable facts) were
moved to [CONTEXT_ARCHIVE.md](CONTEXT_ARCHIVE.md) to keep this file cheap to read. Grep the archive
by keyword or date if you need history beyond what's below — don't read it in full.

---

**2026-09-05 — CAB Co-Pilot: "Business Risk Exposure" still blank after a real Run Simulation — two real bugs found and fixed (Claude)**
- User reported the panel was still empty even after running an actual `/simulation/analyze` simulation (not just a no-SimulationRun scenario, which the earlier same-day fix already covered). Investigated directly against the live local Mongo/FastAPI: **`NodeBusinessMeta` collection had 0 documents** — no node in the Waters demo had ever been tagged with `revenuePerHour`, so every revenue calculation across the whole app (Shadow Run, CAB, Scenario Builder failure scenarios) was correctly computing $0 for lack of any input, which reads as "broken" in a demo.
- Seeded `NodeBusinessMeta` for all 19 live nodes (16 real Waters-seeded nodes + 3 legacy fixture nodes) with realistic revenuePerHour/slaTier/criticality/businessProcesses reflecting the Milford LIMS context (NuGenesis DB $1200/hr platinum-critical down to monitoring $50/hr bronze-low) — keyed by the real graph node id (confirmed via a first-pass mistake: seeding by human-readable label as `nodeKey` silently matched nothing, since every lookup in the codebase queries `NodeBusinessMeta.find({nodeKey: {$in: <real uuids>}})`; caught via direct DB verification and redone correctly, deleting the mistaken label-keyed docs first).
- **Second, independent bug found while verifying the fix**: `SimulationRun.projectedDowntime` is stored in **minutes** (see `api/simulation/analyze/route.ts`'s `estimated_downtime_minutes` and `api/simulation/[id]/impact/route.ts`'s `deriveImpactVector`, which explicitly divides by 60) — but `api/cab/revenue/route.ts` and `api/cab/report/route.ts` were both multiplying `revenuePerHour * projectedDowntime` treating that same field as HOURS, overstating every simulation-run-based revenue-at-risk figure by ~60x. Fixed both call sites to divide by 60 first, with a comment pointing at the impact route as the existing correct precedent. This bug was independent of the missing-data issue and would have shown wildly inflated (not blank) numbers once NodeBusinessMeta was populated.
- Verified end-to-end against the live DB: the most recent SimulationRun (firewall target, 20-minute projected downtime, 1 blast-radius node) now resolves both tagged nodes and computes a correct ~$77 revenueAtRisk (180 × 20min + 50 × 20min, in hours) instead of $0 or a 60x-inflated figure.
- Verified: `tsc --noEmit` clean, `next build` clean, ESLint clean.

---

**2026-09-05 — CAB Co-Pilot: fixed empty "Business Risk Exposure" panel (Claude)**
- Root cause: `api/cab/revenue/route.ts` hard-required a `SimulationRun` to exist for the architecture and returned 404 otherwise. Any scenario built via Scenario Builder's "what if X goes down" failure-scenario flow (or any architecture that was simply never run through `/simulation/analyze`) has no `SimulationRun` at all — same class of gap just fixed in `api/cab/report/route.ts`. The 404 made `cabService.fetchRevenueImpact` return `null`, leaving Total Revenue at Risk/SLA Exposure/Risk-Over-Time all blank in the left panel even when a real revenue figure existed.
- Fixed with the same fallback: when no `SimulationRun` is found for the resolved architecture, the route now reads `revenueImpact` off the architecture's most recent `CabChecklistItem.report` and builds the exact same `{ total, slaExposure, projectedDowntime, chart, nodes }` shape from it (slaExposure recomputed per-node with the same tier-penalty-rate table; chart via the existing `buildChart()` helper) — the panel now shows the same number the AI briefing and PDF already do.
- The two remaining "genuinely nothing to show" cases (no context and no accessible architecture has ever been simulated; a specific architecture with neither a SimulationRun nor a revenueImpact-bearing report) now return a 200 zero-payload instead of a 404, so the panel renders its normal "No revenue data — configure NodeBusinessMeta" empty state instead of the request failing.
- Verified: `tsc --noEmit` clean, `next build` clean, ESLint clean.

---

**2026-09-05 — CAB report: revenue-at-risk from downtime now stated explicitly in the AI briefing (Claude)**
- Gap: `api/cab/report/route.ts` already computed `totalRevenueAtRisk` and passed it to the LLM as "Estimated Revenue at Risk: $X" whenever a `SimulationRun` existed, but the system prompt never required the written `fullText` briefing to actually quote that figure — it could factor into `riskScore` silently and never appear in the narrative a CAB reviewer reads. New REVENUE AT RISK rule in `SYSTEM_PROMPT`: if a nonzero revenue-at-risk figure is given, `fullText` MUST state the exact dollar amount in its risk/impact paragraph; if zero/absent, say so explicitly (no revenue-per-hour tagged) rather than skipping the topic.
- Bigger gap: a change built via Scenario Builder's "what if X goes down" failure-scenario flow (`revenueImpact` on the saved report — see the 2026-09-05 Scenario Builder entry above) has NO `SimulationRun` at all, so the CAB route's revenue computation stayed at $0 for these — the failure-scenario dollar figure never reached CAB review. Fixed: the route now reads `revenueImpact` off the scenario's saved `CabChecklistItem.report` (new `priorRevenueImpact`), feeds it into the prompt as a "Revenue at risk from failure scenario" block (with the per-node breakdown), and falls back to it for `totalRevenueAtRisk` in the emitted `CABReportMeta` when there's no simulation run — so the side panel, the PDF, and the written briefing all agree on the same number instead of the panel showing $0 while the scenario report showed a real figure.
- Verified: `tsc --noEmit` clean, `next build` clean, ESLint clean.

---

**2026-09-05 — CAB Co-Pilot's "Export PDF Report" now generates its own CAB-shaped PDF (Claude)**
- Root cause the user flagged: CAB Co-Pilot's "Export PDF Report" called the exact same `downloadArchitectureReportPdf()` Scenario Builder's "Build with AI" report uses, via a lossy `toAIArchitectureReport()` conversion — risk score got crammed into a generic "metrics" row, compliance tags into "cons", the blast radius summary into "risks", and the rollback plan / per-node affected-nodes list / full AI briefing / revenue exposure chart were dropped entirely. The two PDFs answer different questions (proposed topology change vs. approve/reject recommendation) and should never have shared a template.
- Extracted the shared jsPDF layout primitives (`PdfCursor`, page geometry, color palette, `slugify`) out of `generateReportPdf.ts` into new `lib/report/pdfKit.ts`, so both PDF generators reuse the same look without duplicating ~90 lines or drifting apart.
- New `lib/report/generateCabReportPdf.ts` — `downloadCabReportPdf(meta: CABReportMeta, briefingText, revenueData)` renders CAB's own report directly: decision banner (colored by APPROVE/APPROVE_WITH_CONDITIONS/DEFER/REJECT) + confidence, composite risk score, compliance frameworks, the full AI briefing text, blast radius summary + affected-nodes list (colored bullets per reason: added/removed/modified/directly-connected), a revenue-exposure section with the real total/SLA-exposure figures and a time-bucket bar chart, and the rollback plan as a numbered list. Nothing routes through `AIArchitectureReport` anymore.
- `app/simulation/cab-copilot/page.tsx` footer's "Export PDF Report" button now calls `downloadCabReportPdf(reportMeta, report, revenueData)`. `toAIArchitectureReport()` is kept only for "Submit for CAB Review" (CabChecklistItem storage still expects that shape) — commented to make that scoping explicit so nobody re-wires it back into PDF export later.
- Verified: `tsc --noEmit` clean, `next build` clean, ESLint clean (one unused-import warning from the pdfKit extraction caught and fixed) on all changed/new files.

---

**2026-09-05 — CAB Co-Pilot: "Show Graphically" for Directly Affected Nodes (Claude)**
- The Blast Radius panel's "Directly Affected Nodes" list was text/chips only — no way to see the affected/impacted nodes on an actual topology.
- `types/cab.ts` — `CABReportMeta` gains `architectureId` (the report route already resolves this internally; it just wasn't surfaced), so the frontend can fetch the full node/edge graph regardless of whether the page was opened via `?archId=` (selectedScenario already loaded) or `?runId=` (selectedScenario never populated).
- `api/cab/report/route.ts` — one-line addition passing `archId` through into the emitted `metadata` event.
- `app/simulation/cab-copilot/page.tsx` — new "Show Graphically" link next to the affected-nodes header opens a `Dialog` with a read-only `FlowCanvas`. Reuses `selectedScenario.nodes/edges` when they already match `reportMeta.architectureId`, otherwise lazily fetches `/api/architectures/{id}` on click. Nodes are highlighted via `diffStatusById` built from `reportMeta.affectedNodes` — `reason: 'directly_connected'` maps to the existing `'impacted'` diff chip (same amber "⚠ IMPACT" styling Scenario Builder already uses), `added`/`removed`/`modified` map straight across. A small legend above the canvas explains the four colors.
- Verified: `tsc --noEmit` clean, `next build` clean, ESLint clean on all changed files.

---

**2026-09-05 — Scenario Builder: revenue-at-risk on failure/outage what-ifs (Claude)**
- "Build with AI" reports previously only showed infra costImpact — a "what if X goes down" prompt had no revenue/business-impact figure at all. Added a second, separate `revenueImpact` block to the report, shown only when the instruction is actually a failure/downtime scenario.
- `api/scenario/build-with-ai/route.ts` — new `failureScenario` field on the structured-output schema: the LLM classifies `applicable` (is this a "goes down/fails/outage" instruction, not a migration/add/upgrade), which existing `nodeIds` fail (resolved against the Focused nodes block when given), and a plausible `downtimeHours`. New system-prompt rule (FAILURE / DOWNTIME SCENARIOS) tells the model NOT to put failing nodes in `nodesRemoved` — a hypothetical outage is temporary, not a topology deletion — unless the instruction separately asks for a permanent change too (e.g. "should we add a failover replica").
- The dollar figure itself is never trusted from the model: only *which nodes* and *for how long* come from `failureScenario`; `computeRevenueAtRisk()` (reused as-is from `lib/shadowRun/revenue.ts`, same helper Shadow Run uses) resolves `NodeBusinessMeta.revenuePerHour × downtimeHours` in code after parsing.
- New `src/lib/pricing/revenueRiskModel.json` — the same kind of demo-able methodology artifact `nodeCostModel.json` is for infra cost: documents the formula, the SLA-tier penalty rates, where `downtimeHours` comes from for each caller (Shadow Run's fixed 0.5h/critical-node vs. the Scenario Builder LLM's estimate), the "$0 = no data, not no risk" assumption for untagged nodes, and a worked example.
- `types/aiReport.ts` — new `AIReportRevenueImpact`/`AIReportRevenueBreakdownEntry`, optional `revenueImpact` on `AIArchitectureReport` (absent on older persisted reports and non-failure scenarios).
- `AIReportModal.tsx` — new crimson "Revenue at Risk" card (total + per-node breakdown with SLA tier and $/hr) rendered right after Cost Impact, only when `revenueImpact?.applicable`. `generateReportPdf.ts` mirrors the same section in the downloadable PDF.
- Verified: `tsc --noEmit` clean, `next build` clean, ESLint clean on all changed/new files.

---

**2026-09-05 — Scenario Builder: multi-node "focused" what-if scenarios (Claude)**
- Reused the existing ctrl/⌘-click multi-select (`simulationTargetIds`, previously only fed to "Run Simulation") as the shared "Selected Nodes" concept — same set now also anchors the AI Copilot prompt. Renamed the sidebar panel label from "Simulation Targets" to "Selected Nodes" and updated its helper copy to describe both consumers.
- Added a chip row directly above the AI Copilot Prompt textarea showing whichever nodes are currently selected (label + remove ✕ + clear-all), so the connection between "select on canvas" and "this prompt" is visible right where you type. Placeholder text and the "Build with AI" button label change when 2+ nodes are focused.
- `runAiQuery(query, baseNodes, baseEdges, focusNodeIds?)` — added a 4th param; `handleNlQuery` passes `simulationTargetIds`, the Digital Twin "Build Scenario" auto-run passes `[auto.fromNodeId]`.
- `api/scenario/build-with-ai/route.ts` — accepts `focusNodeIds: string[]` in the body (filtered against the actual canvas node ids so a stale id can't be smuggled in). When non-empty, a "Focused nodes" block (label/id/type/layer/healthScore) is appended to the user message, and a new FOCUSED NODES rule in the system prompt tells the model these are the joint subject of the instruction — apply it to all of them together as one combined scenario (shared failure, shared migration, shared load balancer, etc.) rather than picking one or treating them independently, and to resolve "which nodes" against this set when the instruction itself is ambiguous (e.g. "what if both of these go down together").
- Verified: `tsc --noEmit` clean, `next build` clean, ESLint clean on both changed files.

---

**2026-09-05 — Shadow Run: real revenue-at-risk + Run History detail popup (Claude)**
- Root cause: `lib/shadowRun/divergence.ts`'s `computeRunResult()` always returned `revenueAtRisk: 0` — a hardcoded stub, never computed. It's DB-free by design (runs client-side from the "Run Shadow Sync" button), so it can't reach `NodeBusinessMeta`.
- `computeRunResult()` now also returns `criticalNodeIds: string[]` (sim-side nodes with healthScore < 50) instead of just a count.
- New `lib/shadowRun/revenue.ts` (server-only) — `computeRevenueAtRisk(criticalNodeIds, projectedDowntime)` looks up `NodeBusinessMeta.revenuePerHour` for those keys and sums `revenuePerHour × projectedDowntime`, same math `api/cab/revenue/route.ts` already uses. Returns `{ revenueAtRisk, breakdown }`.
- `api/shadow-runs` POST and `api/cron/shadow-run` GET (scheduler tick) both now call this and override the client/loop-computed `revenueAtRisk` before persisting — real dollar figures on every new run going forward (old rows already saved at $0 aren't retroactively fixed).
- New `lib/architecture/access.ts` — extracted `canAccessArchitecture()` out of `api/shadow-runs/route.ts` so the new detail route below can reuse the same access rule instead of duplicating it.
- New `api/shadow-runs/[id]/route.ts` GET — full detail for one run: per-node live-vs-sim health delta table (sorted worst-first) reconstructed from the stored snapshots, plus the persisted revenue breakdown.
- New `components/shadowRun/ShadowRunDetailModal.tsx` — clicking a Run History row now opens a popup (divergence ring, metrics grid, node health-delta table, revenue exposure breakdown) instead of doing nothing. Wired into `app/simulation/shadow-run/page.tsx` via `detailRunId` state.
- Verified: `tsc --noEmit` clean, `next build` clean, ESLint clean on all changed/new files (one `set-state-in-effect` caught and fixed in the new modal by deriving `loading` instead of tracking it as separate state, matching `app/logs/page.tsx`'s existing pattern).

---

**2026-09-04 — Phase 11, task 3: worked example of a Shadow Run (Claude)**
- Added `EXAMPLE_SHADOW_RUN` static data (5 nodes: LoadBalancer, WebServerA/B, AppServer, DBPrimary) to `app/simulation/shadow-run/page.tsx`. Two node arrays: healthy live baseline (healthScores 85-94) and a DB-failure sim scenario (14-76), yielding divergence=45 (HIGH IMPACT), cpuDelta=25, latencyDelta=72, projectedDowntime=1.0h, revenueAtRisk=$89.5k. All figures are internally consistent with `lib/shadowRun/divergence.ts`'s formula.
- Added `isExample: boolean` state. When true, display values (`dispLiveNodes`, `dispSimNodes`, `dispLiveMetrics`, `dispSimMetrics`, `dispDivergence`, etc.) are overridden with example constants — live polling and real state are untouched and resume the moment `isExample` is cleared.
- "View example run →" button (amber, FlaskConical icon) added to the sim-panel empty state (no arch loaded) and to both history-tab empty states (no arch selected; arch selected but 0 runs). Clicking any of them sets `isExample=true` and switches to the comparison tab.
- A dismissible amber banner ("EXAMPLE RUN · Synthetic data — DB Primary failure scenario · Not from live production") is rendered immediately below the tab bar when in example mode. Both panel headers show a small "Example" badge. The load chart on the left is replaced with a flat synthetic wave. The sim topology shows a "synthetic" chip overlay.
- Architecture picker is disabled while example mode is active; selecting an arch calls `handleArchSelect` which clears `isExample` first.
- Verified: `tsc --noEmit` clean, `next build` clean, `eslint` clean. One file changed: `app/simulation/shadow-run/page.tsx`.

---

**2026-09-04 — Phase 11, task 2: legacy lifecycle metadata on NodeBusinessMeta, threaded into LLM prompts (Claude)**
- Added `LIFECYCLE_STAGES = ['active', 'legacy', 'end_of_life', 'deprecated']` + `LifecycleStage` type to `lib/nodeBusinessMeta/constants.ts` and re-exported from `lib/models/NodeBusinessMeta.ts`.
- `NodeBusinessMeta.ts` schema — new `lifecycleStage` field (`String`, enum, default `'active'`, indexed). Existing untagged nodes default to `'active'` so nothing is mis-classified.
- `api/nodes/[id]/business-meta/route.ts` — GET returns `lifecycleStage`, PUT validates and upserts it. Validation reuses the same pattern as `slaTier`/`criticality`.
- `components/graph/NodeInspector.tsx` — `BusinessMeta` interface gains `lifecycleStage`; `LIFECYCLE_COLORS` map added (green=active, amber=legacy, crimson=end_of_life, gray=deprecated); view section shows lifecycle badge alongside SLA/criticality; edit form gains a `<select>` dropdown (after Criticality); draft state initialized in `handleBizMetaEdit`; save payload includes the new field.
- `lib/copilot/tools.ts` — `getNodeDetails` now returns `lifecycleStage` in the `business` object, so `get_node_details` tool calls supply it to the LLM.
- `api/scenario/build-with-ai/route.ts` — early `dbConnect()` + `NodeBusinessMeta.find()` for all canvas node IDs before the LLM call; `summarizeGraph` annotates non-active nodes with `lifecycleStage`; a "Lifecycle warnings (operator-set)" block is prepended to the user message so the model can name specific legacy/EOL/deprecated nodes in risks without guessing from labels.
- `api/cab/report/route.ts` — `BusinessMetaLean` gains `lifecycleStage`; `NodeBusinessMeta.find()` now fetches for all architecture nodes (not just blast-radius nodes); `allNodesBlock` includes `lifecycleStage` tag on non-active nodes; a separate `legacyBlock` with explicit operator-set warnings is injected into the user message before the sim data.
- Verified: `tsc --noEmit` clean, `next build` clean, ESLint on all changed files clean except pre-existing `react-hooks/set-state-in-effect` in NodeInspector and `no-img-element` warning (both listed as known noise).

---

**2026-09-04 — Phase 11, task 1: multi-node simulation targets (Claude)**
- `lib/graph/blastRadius.ts` — added `computeMultiBlastRadius(originNodeIds[], edges, options?)`: BFS union across multiple origins, deduplicating by node id and keeping the minimum depth per node. Returns `MultiBlastRadiusResult { originNodeIds, impacted }`. Single-origin path is unchanged.
- `lib/models/SimulationRun.ts` — added `targetNodeIds: [String]` field (default `[]`). `targetNodeId` (singular) kept required for backward compat with existing docs; new docs always populate both.
- `app/api/simulation/analyze/route.ts` — now accepts `targetNodeIds: string[]` OR legacy `targetNodeId: string`, normalizes to array. Validates all targets exist in the saved architecture. For multi-target: uses `computeMultiBlastRadius` (no backend FastAPI call — FastAPI `/simulation/run` is single-node-only). For single-target: existing path unchanged (backend mirror still fires for supported types). `summarizeLocalResult` updated to accept string[] labels. Risk score adds +10 per extra target. Both `targetNodeId` (first) and `targetNodeIds` stored on the doc and returned in the response.
- `components/graph/GraphNode.tsx` — added `isSimulationTarget?: boolean` to `GraphNodeRenderData`. Simulation-target nodes get an orange (`#F97316`) outer ring, orange drop-shadow on the icon, and a `▶ SIM` chip (hidden if a diffStatus chip is already showing).
- `components/graph/FlowCanvas.tsx` — added `simulationTargetNodeIds?: string[]` prop threaded into `toFlowNode` (sets `isSimulationTarget`). Changed `onNodeClick` type to `(node, event?: React.MouseEvent)` — event is optional so all existing callers are unaffected. `handleNodeClick` now passes the event through. Added `simulationTargetNodeIds` to the `setNodes` effect dep array.
- `app/simulation/scenario-builder/page.tsx` — added `simulationTargetIds: string[]` state. Ctrl/Cmd/Shift-click on a canvas node toggles it into/out of the simulation target set (regular click still does edit-selection as before). `handleSimulate` resolves targets as: explicit multi-select > single `selectedNodeId` > `nodes[0]` (old fallback). Left panel now shows a "Simulation Targets" section with per-target labels, individual remove buttons, and a Clear all — visible only when nodes are targeted. Run Simulation button label appends `(N targets)` for multi-target runs. Targets are cleared on Load Live, Clear All, and when a targeted node is deleted. Fixed pre-existing missing `edges` dep in `handleSimulate`'s useCallback dep array.
- Verified: `tsc --noEmit` clean, `next build` clean, `eslint` on all changed files clean (only pre-existing `no-img-element` warning in GraphNode).

---

**2026-09-04 — Follow-up: forbade vague unnamed "risk exists across all nodes" claims; categorical/fleet-wide modifications now resolve to actual named nodes (Claude)**
- Immediate follow-up to the `nodesModified`/1-hop-affected-nodes work above. User's actual CAB output
  for the Windows 10→11 prompt was: "No directly-affected nodes were identified... however, potential
  compatibility risks exist across all existing nodes" — technically not fabricating a fake node list
  (correctly said none were identified), but then hedged with an unnamed blanket claim that names
  nothing, which is the same underlying problem: the instruction was categorical ("upgrade Windows 10
  to 11", no single named node) and the model's `nodesModified` came back empty because MODIFICATIONS
  guidance only covered a single named node, not a fleet-wide/categorical one.
- `build-with-ai/route.ts` SYSTEM_PROMPT — MODIFICATIONS rule now explicitly branches: a NAMED node
  vs. a CATEGORICAL/FLEET-WIDE instruction, the latter now resolved the same way bulk MIGRATIONS
  already were (scan the canvas, put EVERY existing node whose label/type plausibly matches the
  category into `nodesModified`, call `get_node_details` on ambiguous ones). Empty `nodesModified` is
  only correct when the architecture genuinely has no node type that could represent the thing being
  changed (e.g. an end-user-workstation OS upgrade against a server-only topology) — and even then the
  model must say so explicitly and specifically, never fall back to vague prose.
- `cab/report/route.ts` SYSTEM_PROMPT — added an explicit ban on unnamed blanket risk claims ("risk
  exists across all nodes" and equivalents) in both the RISK SCORING section and the
  blastRadiusSummary instruction: every asserted risk category must name the specific node(s) it
  applies to from the architecture's node list, or explicitly say the risk can't be narrowed down —
  never gesture at "all nodes" as a category without listing which ones.
- Verified: `tsc --noEmit`, `eslint`, `next build` — all clean. Same caveat as the parent entry — not
  re-run against a live LLM call in this environment; re-test the exact Windows 10→11 prompt and
  confirm `nodesModified` now names actual nodes (or explicitly states the topology has no matching
  node type) instead of an empty list plus vague prose.

**2026-09-04 — Added a real "node modified in place" concept (e.g. OS upgrades) to Build-with-AI, and made all "affected node" lists direct-connection-only instead of multi-hop (Claude)**
- User follow-up to the same-day risk-score fix: an "upgrade Windows 10 to Windows 11" prompt showed
  no changed node anywhere in the Scenario Builder report, because the graph-edit schema only had
  nodesAdded/nodesRemoved — an in-place upgrade of an existing node (no topology change) had nowhere
  to go, so the model returned all-empty change lists. Also asked for CAB Co-Pilot's Blast Radius to
  actually list affected nodes (added/removed/modified, or directly connected to one of those), and
  explicitly said to mark ONLY direct connections as affected, not a deep multi-hop chain.
- **New `nodesModified` concept**, threaded through the whole pipeline:
  - `build-with-ai/route.ts` — new `NodeModifiedSchema` (`id`, `changeDescription`,
    `healthScoreAfter`) and `nodesModified` array on `BuildWithAiSchema`. New system-prompt
    "MODIFICATIONS" rule: an in-place upgrade/downgrade/reconfig of an EXISTING node must be listed in
    `nodesModified` — explicitly states that returning all-empty change lists when the instruction
    clearly targets an existing node is wrong. `finalNodes` applies `healthScoreAfter` when the model
    supplies one.
  - `types/aiReport.ts` — `DiffStatus` gained `'modified'`; `AIArchitectureChangeSet` gained
    `nodesModified: AIReportModifiedNodeRef[]`; `DiffGraphNode` gained an optional `detail` string
    (the change description, shown as a tooltip).
  - UI: `AIReportModal.tsx` now renders a "Nodes Modified" section (cyan, refresh icon) in the
    Scenario Builder's own report popup — this is the direct fix for "upgrade didn't show any node
    getting changed". `DiffGraphView.tsx` / `GraphNode.tsx` / `FlowCanvas.tsx` / `generateReportPdf.ts`
    all gained a `modified` visual variant (cyan ring/chip "⟳ MODIFIED") alongside existing
    added/removed, on both the diff-graph popup and the persistent canvas markers
    (`scenario-builder/page.tsx`'s `diffStatusById`/`diffSummary`, from the earlier "Build Scenario"
    session) and the PDF export.
- **Impact/affected-node lists are now 1-hop only, everywhere they're computed** (previously
  `build-with-ai`'s `impactRadius` used `computeBlastRadius` — the same multi-hop, up-to-10-deep BFS
  used for real dependency-chain/blast-radius simulations — which the user explicitly said was wrong
  for "who's affected" in a report meant to be skimmed):
  - `build-with-ai/route.ts` — replaced the `computeBlastRadius`-based impact walk with a plain
    undirected 1-hop neighbor scan (any edge touching a changed node) over `nodesAdded ∪ nodesRemoved
    ∪ nodesModified`. `AIArchitectureChangeSet.impactRadius`'s `depth` field is now always 1 (kept for
    type back-compat rather than removed). `computeBlastRadius` import removed from this file (its
    multi-hop version is untouched and still used elsewhere — `/api/simulation/analyze`, Digital
    Twin's click-to-highlight dependency chain — that feature is intentionally unrelated and wasn't
    touched).
  - `cab/report/route.ts` — new deterministic `affectedNodes` (type `CABAffectedNode[]`, in
    `types/cab.ts`'s extended `CABReportMeta`), NOT LLM-guessed: built from the scenario's own
    `changeSet` (added/removed/modified + its already-1-hop `impactRadius`) when the architecture has
    one via `CabChecklistItem`, else falls back to the real simulation's own blast-radius entries
    filtered to `depth === 1` plus the simulation's target node. Fed into the LLM prompt so
    `blastRadiusSummary` is grounded in this exact list (system prompt now tells it to name these
    specific nodes and NOT describe multi-hop reach beyond them), and rendered directly as colored
    chips (green/crimson/cyan/amber by reason) under the CAB Co-Pilot's Blast Radius panel
    (`cab-copilot/page.tsx`) — reliable even when the LLM's prose is vague.
- Verified: `tsc --noEmit`, `eslint` on every changed file, `next build` — all clean, all routes
  register. Not re-run against a live OpenAI/Gemini call in this environment (no API key here) — owed:
  re-run "upgrade Windows 10 to Windows 11" end-to-end and confirm the modified node shows up in the
  Scenario Builder report/canvas, and that CAB Co-Pilot's affected-node chips for it are exactly the
  modified node plus its direct neighbors, no more.

**2026-09-04 — CAB risk score can no longer silently default to 0; risk analysis (both Build-with-AI's `risks` field and CAB's `riskScore`) now made to reason across compatibility/EOL, integration, data, security, rollback, and staffing risk, not just structural blast radius (Claude)**
- User reported: a "Build with AI" prompt for "upgrade Windows 10 to Windows 11" showed 0 risk in CAB
  Co-Pilot, missing the obvious real risk that legacy hardware might not support Windows 11. Asked
  for the AI to "think deeply about everything" and never show 0.
- Root cause of the literal 0: `/api/cab/report/route.ts`'s `riskScore` was never LLM-assessed at
  all — it was read straight off `simRun?.riskScore ?? 0`, a purely structural (blast-radius-size)
  number computed by a real `/simulation/analyze` run. A Build-with-AI-created architecture (like an
  OS upgrade) never goes through that simulation endpoint, so `simRun` is null and the score silently
  defaulted to 0 — regardless of what the LLM's own briefing text said.
- Root cause of the missed legacy-hardware risk: even where an LLM does write free-text risks
  (`build-with-ai`'s `report.risks`), the system prompt only asked for "short punchy bullets" with no
  guidance to actually check compatibility/EOL, integration breakage, data integrity, security,
  rollback feasibility, or staffing/vendor risk — so it defaulted to whatever risk was most obvious
  from the instruction text alone.
- Fixes, both prompt-level (no new UI):
  - `build-with-ai/route.ts` — `ReportSchema.risks` now `min(2)` (was unbounded/could be empty) and
    the system prompt gained a "RISK ANALYSIS" section explicitly enumerating the categories above,
    telling the model to check each against the actual canvas/instruction and name specific
    at-risk nodes (e.g. legacy/specialized hardware) rather than stopping at the first obvious risk.
  - `cab/report/route.ts` — `CABReportOutputSchema` gained a required `riskScore` (LLM-assessed,
    `min(1)` — never 0) computed from the same risk-category checklist, with the raw simulation
    blast-radius figure (renamed `structuralRiskScore` locally) demoted to one input among several,
    explicitly labeled to the model as "do not treat this as your final riskScore". `meta.riskScore`
    (what the CAB Co-Pilot UI's Composite Risk Score displays) now comes from `parsed.riskScore`, not
    the structural figure.
  - Also grounded the CAB prompt in what the change actually IS, not just blast-radius stats — it now
    looks up the latest `CabChecklistItem` for the architecture (if any) and includes that report's
    `summary`/`risks`/`cons` plus the full node list (label+type) in the user message, and explicitly
    tells the model when no simulation run exists at all so it says so rather than implying one was
    run. This is what actually lets it reason about "Windows 11 on legacy hardware" instead of
    working from an empty blast-radius block.
- Verified: `tsc --noEmit`, `eslint` on both changed route files, `next build` — all clean. Not
  re-run against a live OpenAI/Gemini call in this environment (no API key here) — owed: re-run the
  exact "upgrade Windows 10 to Windows 11" prompt end-to-end and confirm both a nonzero, justified
  `riskScore` in CAB Co-Pilot and a legacy-hardware-compatibility line in Build-with-AI's `risks`.

**2026-09-04 — Cost-impact numbers now computed from a documented rate card, not an LLM guess (Claude)**
- User wanted a concrete, showable artifact explaining how the Scenario Builder report's
  `costImpact` dollar figures (currentMonthlyCostUsd/projectedMonthlyCostUsd/deltaPercent) are
  actually calculated — previously the LLM invented them freely per the system prompt's own
  admission ("illustrative estimates... base them on rough reasoning"), meaning the same before/
  after canvas could produce a different number on every run with no way to explain why.
- New `src/lib/pricing/nodeCostModel.json` — the rate card itself, and the artifact to show: a flat
  illustrative monthly USD rate for each of the 16 `NodeType` values, each broken into 2-3 cost
  components (e.g. firewall: $380 = $180 appliance amortization + $120 threat-intel subscription +
  $80 support), plus a `methodology`/`assumptions` block spelling out exactly what this is and
  isn't (not a real vendor quote, flat per-node not per-resource-unit, cloud is a rough baseline
  since usage-based spend can't fit a static table, etc.). Verified every component breakdown sums
  to its stated total before wiring anything up.
- New `src/lib/pricing/estimateCost.ts` — `estimateCostImpact(beforeNodes, afterNodes)`: sums each
  side's per-node-type rate from the JSON (unrecognized types fall back to the generic
  "infrastructure" rate, mirroring `backendAdapters.ts`'s own unknown-type fallback convention) and
  returns `{ currentMonthlyCostUsd, projectedMonthlyCostUsd, deltaPercent }` — deterministic, no LLM
  involved, reproducible from the same two node lists every time.
- `build-with-ai/route.ts` — now calls this after computing `finalNodes` and overrides whatever
  `costImpact` the LLM produced with the real computed result before the report is saved/returned.
  Adjusted the system prompt's costImpact instruction: the LLM still has to fill the field in
  (required by the Zod schema) but is told it's a discarded placeholder, and — importantly — told
  NOT to reference specific dollar figures anywhere else in the report text (summary/pros/cons/
  risks/recommendation), so nothing it writes can end up contradicting the real computed numbers
  the report actually displays.
- Verified: `tsc --noEmit` clean, `eslint` clean, `next build` clean, and hand-verified the actual
  arithmetic against the rate card outside the app (firewall+application+database before vs.
  firewall+application+cloud after → $1050 → $830, -21.0% — matches `estimateCostImpact`'s own
  rounding exactly).

**2026-09-04 — Fixed: "Build Scenario" prompt never showed in the Scenario Builder box (Claude)**
- Follow-up to the "Build Scenario" hand-off feature. User reported the AI Copilot Prompt textarea
  sat empty on the Scenario Builder page after navigating there from a Digital Twin node — real bug,
  not a display issue: the mount-only auto-run effect (`scenario-builder/page.tsx`) called
  `runAiQuery(auto.prompt, ...)` directly without ever writing `auto.prompt` into the `prompt` state
  the textarea is bound to, so there was nothing for the box to show regardless of timing.
- Fixed by calling `setPrompt(auto.prompt)` right when the hand-off is consumed, before the live
  graph even loads — so it's visible immediately, not just once the AI response lands.
- Also removed `runAiQuery`'s `setPrompt('')` on success (applied to both the manual "Build with AI"
  button and this auto-run path) per the same complaint's second half — user wants the prompt that
  actually produced the current canvas to stay visible as a record even after closing the report,
  not clear itself the moment generation finishes. A new instruction now replaces it by being typed
  over, not by the app blanking it automatically.
- The persistent-diff-on-canvas piece (added/removed/impacted markers surviving report-close) from
  the original "Build Scenario" work was re-verified still correctly wired (`lastChangeSet`/
  `lastRemovedGhosts`/`displayNodes`/`diffStatusById` all intact, untouched by the unrelated
  same-day node/edge-darkening change) — nothing needed fixing there.
- Verified: `tsc --noEmit` clean, `eslint` clean (same single pre-existing unrelated
  `handleSimulate` warning as always), `next build` clean.

**2026-09-04 — Graph canvas nodes/edges darkened — too light against the current cream theme (Claude)**
- User said nodes and edges on the graph canvas read as "very light." Checked the actual icon PNG
  assets first rather than guessing (`public/assets/infrastructure/*.png`) — they're mid-toned
  (~rgb(40,120,135) average, a dark teal), not literally pale. The real cause: `globals.css`'s
  `--color-brand-bg` is `#F4EEDF` (light cream — the design moved off the dark-mode-only palette
  described in this file's older Design Aesthetic notes at some earlier point) and nodes render the
  icon directly with no backdrop, so a mid-toned icon has much less visual weight against a light
  canvas than it would against a dark one — reads as faint even though the pixels aren't pale.
- `GraphNode.tsx` — re-added a solid badge disc behind each node's icon. `badgeColor` (health- or
  type-derived, depending on `colorMode`) already existed in this file for exactly this and was
  sitting completely unused (confirmed by `eslint`'s own `'badgeColor' is assigned a value but never
  used` warning, which is now gone) — the badge markup itself had been stripped at some earlier
  point, orphaning the variable. Restored it: `${badgeColor}26` translucent fill, solid
  `badgeColor` border, subtle inset ring; icon shrunk to 72% and layered on top.
- `FlowCanvas.tsx`'s `toFlowEdge()` — default (non-dimmed, unselected) edge opacity 0.7 → 0.92 and
  stroke width 1.5 → 2px; highlighted/selected width 2.5 → 2.75px for the size gap to stay
  proportionate.
- Verified: `tsc --noEmit` clean, `eslint` clean (the orphaned-variable warning resolved, no new
  issues — only the pre-existing unrelated `<img>` LCP warning remains), `next build` clean.

**2026-09-04 — Fixed: "Build Scenario" box was invisible without scrolling (Claude)**
- Follow-up to the same-day "Build Scenario" feature below. User reported not being able to see it
  in the Digital Twin. Root cause: it was placed near the BOTTOM of `NodeInspector.tsx`'s long
  scrollable panel (after Dependency Map, Active Alerts, and Remediation Actions), so it required
  scrolling past all of that first — easy to miss, especially on a node with several alerts/actions
  pushing it further down.
- Moved it to right after the base identity block (name/health gauge/type/status — the very first
  thing rendered) and before the type-specific detail panel, so it's the first interactive thing
  visible when the inspector opens, no scrolling required. Also gave it a cyan-tinted background box
  (was plain, blended into the rest of the panel) so it reads as a distinct primary action.
- Verified: `tsc --noEmit`, `eslint` (same pre-existing `load()`/set-state-in-effect noise as before,
  confirmed at the same line, not introduced by this move), `next build` — all clean.

**2026-09-04 — "Build Scenario" from a Digital Twin node → auto-runs AI Copilot → persistent diff on canvas (Claude)**
- User wanted: click a node in Digital Twin → a chat-like prompt box → submitting it takes you to
  Scenario Builder and shows the final report → after closing/downloading that report, the Scenario
  Builder canvas itself keeps showing what changed (new nodes, deleted nodes, impact radius), not
  just inside the report modal.
- Investigated before building anything: Scenario Builder's existing "Build with AI" flow
  (`POST /api/scenario/build-with-ai`) already computes everything needed for the second half of
  this ask — `report.changeSet` (nodesAdded/nodesRemoved/impactRadius, blast-radius-computed against
  the pre-change graph) and a `diffGraph` already rendered by `DiffGraphView` inside the existing
  `AIReportModal` (added=green, removed=dashed crimson, impacted=amber ring — already has a
  "Download PDF" button too). None of that needed touching; what was missing was (1) an entry point
  from Digital Twin, (2) auto-running that flow instead of requiring the user to load-live and
  retype the prompt manually, and (3) making the SAME diff markers persist on the real, editable
  canvas after the modal closes, not just in the modal's own small side-by-side ReactFlow.
- New `src/lib/scenario/autoPrompt.ts` — one-shot sessionStorage hand-off (`setScenarioAutoPrompt`/
  `consumeScenarioAutoPrompt`), not a URL query param — prompts are free-text/long and this is a
  single hand-off, not a bookmarkable/shareable link.
- `NodeInspector.tsx` — new "Build Scenario" section (textarea + button, same visual language as
  Scenario Builder's own AI Copilot prompt box): on submit, stores `{prompt, fromNodeId,
  fromNodeLabel}` via the new module and `router.push('/simulation/scenario-builder')`.
- `scenario-builder/page.tsx` — refactored `handleNlQuery` into a lower-level `runAiQuery(query,
  baseNodes, baseEdges)` that takes the canvas explicitly instead of reading `nodes`/`edges` off
  React state (state setters batch, so calling the old closure-based version immediately after
  `setNodes(liveGraph)` would have read the STALE empty canvas, not what was just loaded). A new
  mount-only effect consumes the auto-prompt, loads the live graph for real context, and calls
  `runAiQuery` immediately — this is what makes it a literal one-click "click node → get taken to
  Scenario Builder with the live topology and the final report" flow.
- Added `lastChangeSet`/`lastRemovedGhosts` state, set on every successful AI edit. `lastRemovedGhosts`
  holds the ACTUAL pre-edit node objects for anything removed (real position/health/everything, not
  synthesized) — GraphNode.tsx already renders them correctly, they just need to stay visually
  present. `displayNodes` (nodes + these ghosts) feeds FlowCanvas instead of raw `nodes`;
  `diffStatusById` (added/removed/impacted per id) feeds a new `GraphNode.tsx` `diffStatus` prop —
  same color language as `DiffGraphView` (dashed crimson ghost for removed, green ring + "+ NEW" chip
  for added, amber "⚠ IMPACT" chip for impacted), now on the real interactive canvas, persisting until
  explicitly dismissed (small pill banner, top-left, with a "×") or cleared by Load Live/Clear All.
- **Real bug caught before it shipped**: `FlowCanvas`'s existing drag-sync (`handleNodeDragStop` →
  `onNodesUpdate(nodes.map(fromFlowNode))`) syncs back EVERY currently-rendered node, including
  injected ghosts — dragging anything on the canvas would have silently made a "removed" ghost node
  permanently real again. Fixed by filtering ghost ids out of `handleNodesUpdate`'s incoming list
  before committing to real `nodes` state.
- Verified: `tsc --noEmit`, `eslint` (only pre-existing, undisturbed warnings/errors — confirmed by
  reading exact line numbers before assuming anything was mine), `next build` all clean.

**2026-09-04 — Demo topology simplified: 53 nodes → 16, one site instead of five (Claude)**
- Context-only entry — all changes are in `InfraMind.py` (separate repo), zero frontend changes.
  User said the seeded demo graph had gotten too complex to visualize at a glance and asked for
  fewer nodes while staying "functional with all the different types of nodes."
- `InfraMind.py/scripts/seed_waters_demo.py` rewritten: 53 nodes/78 relationships across 5 sites →
  16 nodes/27 relationships, one site (Milford-DC1, 3 rooms), one clean layered topology. Still
  covers every major node type (firewall, switch, load balancer, virtualization host,
  directory/auth, storage, monitoring, database, application, web server, cloud).
- All 10 node names the Predictive Maintenance seed script and every `src/lib/syntheticData/*.json`
  curated entry are keyed against were deliberately kept unchanged (same names, same
  `health_score`) — this repo's dependent features (the trained model, the curated panel data)
  needed no changes and were verified live to still work correctly after the topology shrink.
- The 37 removed node names are actively cleaned up from the live Postgres/Neo4j on every reseed
  (not just dropped from the node list going forward), including a stray leftover edge between two
  surviving nodes that the cleanup initially missed and was caught/fixed by diffing the live graph.
- Full detail in `InfraMind.py/context/DEVELOPMENT_STATUS.md`'s same-date AGENT NOTES.

**2026-09-04 — Clicking a node now highlights its full dependency chain + blast radius (Claude)**
- User wanted clicking a node in the Digital Twin graph to show all its dependencies highlighted
  plus the full impact/blast radius if it fails — previously `FlowCanvas.tsx` only dimmed
  everything except *direct* (1-hop) neighbors, with dependencies and dependents both drawn the
  same green "neighbor" color, no distinction and no multi-hop reach.
- `src/lib/graph/blastRadius.ts` — `computeBlastRadius()` already did exactly this BFS (mirrors the
  backend's real `[*1..10]` Neo4j blast-radius query) but only in the "impacted" direction. Added a
  `direction: 'dependents' | 'dependencies'` option (default unchanged, so every existing caller —
  the Scenario Builder AI Copilot's blast-radius tool, `/api/simulation/analyze`, etc. — is
  unaffected) and a `computeDependencyChain()` wrapper that walks the reverse direction: the full
  transitive set of everything the selected node needs, not just its direct dependencies.
- `FlowCanvas.tsx` — replaced `neighborIds` (1-hop, undirected) with `dependencyChainIds` and
  `blastRadiusIds` (each full-depth, computed once per selection via the two functions above).
  `toFlowNode`/`toFlowEdge` now tag nodes/edges as being in one chain or the other; edges are only
  highlighted when BOTH endpoints are in the same chain (or one endpoint is the selected node
  itself), so the highlighted set traces the actual dependency/impact *path*, not just a scatter of
  unrelated edges touching highlighted nodes.
- `GraphNode.tsx` — `isNeighbor` replaced with `isDependency` (cyan glow — matches
  `NodeInspector.tsx`'s existing cyan "Upstream dependencies" label) and `isImpacted` (amber glow —
  matches its existing amber "Downstream dependents" label), so the new canvas highlighting reads
  consistently with the text panel that was already using those two colors for the same concepts.
- New `ImpactLegend` overlay (bottom-right of the canvas, next to the existing type/health legend)
  appears whenever a node is selected, explaining the two colors and showing live counts —
  "Depends on (N)" / "Impacted if it fails (N)" — since a graph lighting up cyan/amber isn't
  self-explanatory without a key.
- Single shared `FlowCanvas` component, so this applies everywhere it's used, not just
  `/digital-twin` — also Scenario Builder, Shadow Run, and Replay.
- Verified: `tsc --noEmit`, `eslint`, `next build` all clean.

**2026-09-04 — Curated syntheticData entries for every real seeded node, per type (Claude)**
- User pointed at `src/lib/syntheticData/*.json` (12 files — one per type-specific detail panel:
  firewall, switch, load balancer, storage, monitoring source, cloud, virtualization host,
  directory/auth, plus network device/vm/container/infrastructure with no matching backend node
  type today) and asked to populate curated data for each real node of that type in the seed, and
  keep the same structure so future nodes of that type follow the same shape.
- Each panel (`FirewallPanel.tsx`, `SwitchPanel.tsx`, etc.) already had this exact design:
  `curatedData[node.id] ?? fallbackData(node.id)` — a hand-curated JSON entry if one exists for
  that node id, else a deterministic pseudo-random fallback (seeded by node id via
  `mockStatsFor`) in the same schema. Previously only ONE placeholder mock node id per type had a
  curated entry; every real backend/seeded node fell to the generic fallback. Added a curated
  entry for every one of the 26 real Waters-demo nodes whose backend `node_type` maps to one of
  these 8 covered panels (firewall ×6, switch ×5, load_balancer ×2, storage ×3, monitoring ×2,
  cloud ×3, virtualization_host ×3, directory_auth ×2) — generated via a one-off Python script
  (not committed, scratch-only) that reads each node's real seeded `health_score`/`status` from
  `InfraMind.py/scripts/seed_waters_demo.py` and scales every field in that panel's *exact*
  existing schema accordingly (worse health → worse "bad" metrics — errors, denied connections,
  latency, failed logins — and vice versa for "good" ones), with small deterministic per-node
  jitter so same-health nodes don't produce byte-identical rows. The one offline node
  (`hyperv-cluster-singapore`) gets an explicit all-zero "host is down, nothing running" reading
  instead of the health-scaled formula, which would otherwise show a maxed-out-but-nonsensical
  load on a node that isn't actually running anything.
- Also retyped `ad-dc01-milford`/`ad-dc02-wexford` from `app_server` to `directory_auth` in
  `seed_waters_demo.py` (backend repo) — `mapNodeType()` in `backendAdapters.ts` already passes
  literal `NodeType`-matching backend strings straight through, so this alone was enough to route
  them to the dedicated `DirectoryAuthPanel` (with the new curated `directoryAuthData.json`
  entries) instead of the generic `ApplicationPanel`.
- Existing placeholder mock entries in every file were preserved (merged, not replaced) — nothing
  else that reads them changes behavior.
- "Further nodes of that type automatically use the same structure" is inherent to the existing
  panel design, not new plumbing: any node without a curated entry already falls to
  `fallbackData()`, which returns the identical TypeScript interface shape. No code changes were
  needed to guarantee that — it's how these panels always worked.
- Verified: all 12 JSON files parse (`python -m json.tool`), `tsc --noEmit` clean, `next build`
  clean, spot-checked several entries by hand (e.g. the degraded `unifi-lab-ap-milford` switch
  shows 40/48 ports up + "Topology Change Detected" vs. healthy switches' 44-48/48 + "Forwarding —
  No Loops"; the critical `ad-dc01-milford` AD node shows 55 failed logins/"Replication Lag
  Detected" vs. the healthy `ad-dc02-wexford`'s 13 failed logins/"Healthy — All DCs In Sync"). Also
  re-ran `seed_waters_demo.py` and confirmed live via `curl` that both AD nodes now report
  `node_type: "directory_auth"` from the running backend.
- The uncovered files (`networkDeviceData.json`, `vmData.json`, `containerData.json`) stay
  mock-only — nothing in the current Waters topology has a real backend `node_type` of `vm` or
  `container` (individual VMs/containers aren't modeled, only their virtualization hosts are), so
  there's nothing real to curate there yet.

**2026-09-04 — Fixed "The infrastructure service did not respond in time" (Claude)**
- User hit this exact error (thrown by `src/services/graph.service.ts:17` when `/api/fleet/graph`
  doesn't respond within its 10s client-side abort). Investigated live rather than guessing: all
  docker containers reported "Up," but `curl`ing the backend directly hung for 5s+ with zero bytes
  back (TCP connection accepted, HTTP request never answered) — not a "backend down" case, a
  "backend up but its app never finished loading" case.
- **Real root cause was entirely in the backend repo (`InfraMind.py`)**, not this repo:
  `docker logs inframind_backend` showed the FastAPI app crashing on every startup/reload with
  `AssertionError: Status code 204 must not have a response body` in `backend/routers/nodes.py`'s
  `delete_node` route — `from __future__ import annotations` in that file turns its `-> None`
  return-type hint into a string at runtime, so FastAPI can't auto-infer "no response body" for
  its `status_code=204`; the sibling `remove_node_edge` route already had the fix
  (`response_model=None` stated explicitly) but the older `delete_node` route didn't. Full detail
  and the fix are in `InfraMind.py/context/DEVELOPMENT_STATUS.md`'s 2026-09-04 AGENT NOTES.
  Restarted the container after the fix and confirmed live: clean startup (no crash/reload loop),
  `curl /fleet/graph` now returns 200 in ~135ms.
- **Frontend-side defensive fix, this repo**: `src/lib/mongodb.ts`'s `mongoose.connect(uri)` had no
  `serverSelectionTimeoutMS`/`connectTimeoutMS` set, so Mongoose's 30s default would silently blow
  past every caller's own client-side timeout (e.g. this same 10s abort) if Mongo were ever
  actually unreachable — surfacing the same misleading "service did not respond" message pointing
  at the wrong system. Added `{ serverSelectionTimeoutMS: 5_000, connectTimeoutMS: 5_000 }` to both
  `mongoose.connect(...)` call sites (the primary attempt and the DNS-fallback retry) so a genuine
  Mongo outage now fails fast and returns a real error well inside every route's own timeout budget,
  instead of hanging silently for up to 30s.
- Verified: `tsc --noEmit`, `eslint src/lib/mongodb.ts`, `next build` all clean. This particular
  session's actual trigger was the backend crash above, not a Mongo outage — the mongodb.ts change
  is a real but previously-latent gap that didn't happen to be the cause this time.

**2026-09-04 — Fixed "Build with AI" wiping the whole canvas on bulk migrations (Claude)**
- User reported: asking "migrate everything from AWS to Azure" removed every node on the canvas
  (not just the AWS ones) and left only a handful of new, incorrectly-connected Azure nodes.
- Root cause was purely in the system prompt (`src/app/api/scenario/build-with-ai/route.ts`'s
  `SYSTEM_PROMPT`, `GRAPH EDIT RULES` section): the only migration guidance given to the LLM was
  for a SINGLE named node ("migrate X to Y" → add the new node, remove the old one, reconnect
  whoever depended on it). A global/bulk phrase like "migrate everything" had no corresponding
  rule, so the model improvised — interpreting it as "discard the existing graph, sketch a small
  new one" rather than "replace every in-scope node 1:1 and preserve the topology."
- Fix: rewrote the migration guidance to explicitly cover both cases. It now tells the model to
  first determine SCOPE — a named node for a specific migration, or every existing node whose
  label/type/region signals the source provider/system for a bulk phrase ("migrate everything from
  AWS to Azure" → every node mentioning AWS/Amazon) — and to leave every out-of-scope node
  completely untouched. For each in-scope node it must add exactly one destination replacement
  (preserving the original role/type), remove the old node, and REWIRE every edge the old node had
  onto the new one against the same counterpart (or onto the counterpart's own new replacement, if
  that counterpart is also being migrated) — so the new destination subgraph ends up wired in
  exactly the same shape the old one was, connected to the rest of the untouched canvas, not just
  to itself. The full edge list is already included in the canvas summary sent to the model, so
  this rewiring doesn't need extra tool calls — `MAX_TOOL_ROUNDS` was left at 2.
- Verified: `tsc --noEmit`, `eslint`, `next build` all clean. This is a prompt-only change — no
  schema/route/persistence logic touched. Not verified live (no `OPENAI_API_KEY`/browser available
  in this environment) — owed: re-run the exact "migrate everything from AWS to Azure" prompt
  against a canvas with a mix of AWS and non-AWS nodes and confirm only the AWS ones are replaced,
  with edges preserved end-to-end.

**2026-09-04 — Fixed missing node layout on Load Live / Load Architecture / Build with AI (Claude)**
- User reported that loading live data (and other load paths) into the graph canvas
  (`FlowCanvas.tsx`, used by both Digital Twin and Scenario Builder) didn't bring in a sensible
  node layout/placement.
- Root cause: `GraphNode.position` (x/y) simply doesn't exist upstream for most load paths — the
  live FastAPI backend has no position concept (`backendAdapters.ts`'s node mapper never sets it),
  and the AI-generated nodes from `/api/scenario/build-with-ai` never set one either (the LLM only
  returns id/label/type/layer/region/healthScore). `FlowCanvas.tsx`'s `toFlowNode` silently
  fell back to `{ x: Math.random()*800, y: Math.random()*600 }` per positionless node — a random
  scatter, not a layout — and the existing dagre auto-layout (`src/lib/graph/layout.ts`) was wired
  only to the manual "Re-layout" button, never invoked automatically after a data load.
- Fix, `src/components/graph/FlowCanvas.tsx`: both the initial-mount node build and the
  prop-resync `useEffect` now detect when any incoming node has no position anywhere (not from the
  prop, not from a previous local drag — tracked via a new `positionedIdsRef` so this only fires
  for genuinely new positionless nodes, not on every re-render/selection change) and in that case
  run the whole canvas through `layoutWithDagre` before displaying it, then `fitView` — i.e.
  automatically doing what the manual Re-layout button already did, instead of leaving nodes
  scattered/overlapping. Added a small `toStructuralEdges` helper (id/source/target only) so this
  doesn't need the full styled edge objects just to feed dagre.
- This is a full-canvas re-layout when triggered (dagre recomputes every node's position from the
  graph structure, not just the missing ones) — acceptable since it only fires when at least one
  node is genuinely positionless, matching what happens today if the user clicks Re-layout by hand.
- Verified: `tsc --noEmit`, `eslint src/components/graph/FlowCanvas.tsx`, `next build` — all clean.
  Not click-tested live (no browser in this environment) — owed: confirm Load Live / loading a
  saved architecture / Build with AI all now render a clean hierarchical layout instead of
  scattered/overlapping nodes, and that dragging nodes afterward still persists correctly on Save.

**2026-09-04 — "Build with AI" now produces a full vendor-style report, saves the architecture, and queues it on a new CAB checklist (Claude)**
- User asked for the Scenario Builder's "Build with AI" button to do much more than its previous
  quiet inline canvas edit: run the AI, show a popup report (cost metrics, pros/cons, improvements),
  generate and save the resulting architecture, add it to a CAB Co-Pilot checklist for review, and
  let the user download the report as a PDF. Confirmed with the user this *replaces* the old
  quick-edit behavior entirely (no second button).
- **Reworked `/api/nl` into `/api/scenario/build-with-ai`** (`src/app/api/scenario/build-with-ai/route.ts`,
  new — old `src/app/api/nl/route.ts` and `src/services/nl.service.ts` deleted, nothing else
  referenced them). Same OpenAI tool-calling loop and node/edge-edit schema as before
  (`src/lib/copilot/tools.ts` untouched), extended with a `report` object the model now also
  returns in the same call: `costImpact` (illustrative current/projected monthly cost estimate —
  no real pricing API), 3-6 before/after `metrics`, `pros`/`cons`/`improvements`/`risks`, and a
  `recommendation` paragraph (shape: `src/types/aiReport.ts`'s `AIArchitectureReport`). Gated with
  `requirePermission('runWhatIfSimulations')` (same permission `/api/simulation/analyze` uses).
  The route now computes the final node/edge graph server-side (previously done client-side), then
  persists it as a new `Architecture` (same shape `POST /api/architectures` creates) and a new
  `CabChecklistItem` (`src/lib/models/CabChecklistItem.ts`, new model — `status: pending`, the
  full report as `Mixed`, denormalized architecture/creator names) in the same request, calling
  `logActivity` for both.
- **CAB Co-Pilot checklist** — new `GET /api/cab/checklist` (list, `?status=` filter) and
  `GET`/`PATCH /api/cab/checklist/[id]` (`PATCH` gated with the existing `approveCabChanges`
  permission — `ADMIN`/`CAB_APPROVER`). `src/app/simulation/cab-copilot/page.tsx` gained a
  "Pending Architecture Reviews" strip above the existing two-column layout: horizontally
  scrollable cards with a cost-delta badge, a Review button (jumps to that architecture's
  `?archId=` context, reusing the page's existing report-generation flow — no new loading logic),
  and inline Approve/Reject. Also wired the two previously-dead footer buttons ("Export JSON" /
  "Export PDF Report") to actually export the currently-generated `reportMeta`.
- **PDF export** — added `jspdf` (no PDF library existed in the repo before). New
  `src/lib/report/generateReportPdf.ts` (`downloadArchitectureReportPdf`) does a client-side,
  text-only structured PDF (title, summary, cost impact, metrics, pros/cons/improvements/risks,
  recommendation) via jsPDF's core API with manual pagination — no `jspdf-autotable` needed for
  content this modest. Used by both the new `AIReportModal` and the CAB Co-Pilot's PDF export
  button (the latter maps `CABReportMeta` into the same `AIArchitectureReport` shape rather than
  forking the PDF layout).
- **New popup**: `src/components/scenario/AIReportModal.tsx`, opened from
  `src/app/simulation/scenario-builder/page.tsx` after a successful "Build with AI" call — replaces
  the old toast-with-Revert flow (no longer applicable now that the change is already saved).
  Extracted the modal shell out of `ScenarioToolbar.tsx` into a shared `src/components/ui/Dialog.tsx`
  so both modals share the same overlay/escape/scroll behavior instead of duplicating it.
- Verified: `tsc --noEmit` clean, `next build` clean (`/api/nl` no longer registers;
  `/api/scenario/build-with-ai` and `/api/cab/checklist(/[id])` do — 66 routes total), `eslint` clean
  on every new/changed file. One new lint error surfaced and was fixed during this pass: the new
  checklist-fetch `useEffect` in `cab-copilot/page.tsx` initially called `setChecklistLoading(true)`
  synchronously in the effect body (`react-hooks/set-state-in-effect`) — removed, since the
  `checklistLoading` state already initializes to `true` and nothing else re-triggers that effect.
  The three pre-existing `react-hooks/set-state-in-effect` errors already present in
  `ScenarioToolbar.tsx` (`SaveAsModal`/`LoadModal`/`ShareModal`) were not introduced by this change
  and were left alone, consistent with how the 2026-08-29 session handled the same pre-existing
  error class in `Navbar.tsx`.
- **Not verified live** — no browser/backend available in this environment. Owed: enter a prompt in
  Scenario Builder → confirm the popup renders with realistic report content → PDF downloads and
  opens correctly → the new architecture appears in the Load list → the item appears in the CAB
  Co-Pilot's Pending Architecture Reviews strip → Approve/Reject works for a CAB_APPROVER/ADMIN and
  is correctly forbidden for other roles.

**2026-09-04 — More demo nodes + real Predictive Maintenance training data; fixed the Predictions table (Claude)**
- User asked for (1) more seeded nodes under different departments/locations as small simple
  standalone architectures, and (2) real, clean Predictive Maintenance data "so we can show it
  nicely." Almost all the work is in `InfraMind.py` (separate repo) — see that repo's
  `context/DEVELOPMENT_STATUS.md` 2026-09-04 AGENT NOTES for the full, fairly involved debugging
  story (getting a genuinely learnable model out of synthetic data took four separate root-cause
  fixes: incident/train-val-split timing, overlapping incidents, a pre-existing alert-seeding
  idempotency bug that was quietly corrupting training labels, and an artifact-path mismatch
  between host-run training and the Dockerized live server). Final model: 71% accuracy, 96%
  precision, 69% roc_auc — a real, believable result, not a suspicious 100%.
- **Frontend fix, this repo**: `GET /model-accuracy/predictions` used to return every row with
  identical placeholder text (`predictedValue: "High Risk"` for literally every row regardless of
  what was actually predicted, static `scenario`, `deviation` always 0) because the backend route
  never joined back to the actual `MLPrediction`. Backend now returns real per-row data (real node
  name in `scenario`, real predicted/actual percentages, real deviation) — full detail in the
  backend repo's notes. On this side, that surfaced a second, purely-frontend bug: `PredictionRecord['outcome']`
  (`src/lib/mockData/mockModelAccuracy.ts`) and the `outcomeBadge` color map
  (`src/app/digital-twin/model-accuracy/page.tsx`) only ever covered this page's own 3-value mock
  vocabulary (`accurate`/`acceptable`/`inaccurate`) — every real backend outcome value (`CORRECT`/
  `EARLY`/`LATE`/`FALSE_POSITIVE`/`FALSE_NEGATIVE`/`NO_FAILURE`) fell through the lookup and
  rendered as a flat gray badge (`Badge`'s `variant='neutral'` default) no matter whether the
  prediction was actually a hit or a miss. Extended both the type union and `outcomeBadge` to cover
  the real enum too: `CORRECT`→healthy(green), `EARLY`→info(cyan), `LATE`/`FALSE_POSITIVE`→
  warning(amber), `FALSE_NEGATIVE`→critical(crimson), `NO_FAILURE`→neutral(gray). Mock mode is
  untouched (its 3 original keys are still there).
- Verified: `tsc --noEmit` / `eslint` / `next build` all clean. Also verified live against the
  actually-running backend (not just compiled) — `curl`'d `/model-accuracy/predictions` before and
  after the backend fix to confirm the response shape actually changed as expected.

**2026-09-04 — Live region/building/floor/room now populated (backend-only change) (Claude)**
- Context-only entry — all code changes are in `InfraMind.py` (separate repo), zero frontend
  changes needed. User asked to break each node's flat `location` string down into
  region/building/floor/room. Turned out this repo's own `GraphFilterBar.tsx` (cascading
  Region→Building→Floor→Room filter) and `backendAdapters.ts`'s `BackendGraphNode` interface
  already declared `region`/`building`/`floor`/`room` as optional fields — that cascading filter
  has been fully built and wired since an earlier session, just silently empty because the
  backend never sent those fields. Confirmed via `curl` against the live backend after the fix:
  `/nodes` and `/fleet/graph` both now return real values (3 distinct regions across the 53-node
  demo topology) — the Digital Twin page's location filter should populate and actually narrow
  results now, with zero code changes needed on this side.
- Full detail (new Postgres columns + idempotent bootstrap migration + schema/router changes +
  the seed script's new `NODE_PLACEMENT` mapping) in `InfraMind.py/context/DEVELOPMENT_STATUS.md`'s
  2026-09-04 AGENT NOTES.
- Same session also fixed a real bug in the backend's predictive-maintenance historical-data seed
  script (incident timing was skewing the chronological train/val split so badly the trained
  model scored as statistically no-skill — 47.8% accuracy, 0.6% recall — despite real underlying
  signal in the data). Re-seeded and retrained for real: 71.4% accuracy / 96.4% precision / 69.4%
  ROC-AUC now, verified live via the running backend's `/model-accuracy/*` endpoints. Also
  backend-only, no frontend changes. Same AGENT NOTES entry has full detail.

**2026-09-04 — Fixed Clerk rate-limit timeouts: stopped calling currentUser() on every request (Claude)**
- User reported Clerk requests timing out with "too many requests."
- Root cause in `src/lib/auth/rbac.ts`'s `ensureMembership()` (called by `getCurrentMembership()`,
  which every one of `requireRole`/`requireDepartment`/`requirePermission` calls — i.e. nearly every
  authenticated API route in the app, several of which are on 30s auto-refresh polling, e.g.
  `digital-twin/node-health/page.tsx`): it called Clerk's `currentUser()` **unconditionally on every
  single request**, even when the caller's Membership doc already existed and was already `ACTIVE`
  (the overwhelming majority of traffic once a user is onboarded). `currentUser()` isn't like
  `auth()` — `auth()` just reads the locally-verified session JWT (no network call), but
  `currentUser()` makes a live network call to Clerk's Backend API every time it's invoked. That's
  what was tripping Clerk's rate limit under normal app usage, not any single expensive endpoint.
- Fix: `ensureMembership()` now returns immediately once it finds an existing `Membership` whose
  `status === 'ACTIVE'`, before ever touching `currentUser()`. That Backend API call is now reached
  only on the genuinely rare paths — a brand-new user's first request (no Membership doc yet) or a
  still-`PENDING` doc that might have since resolved to ACTIVE (e.g. added to `ADMIN_EMAILS` after
  signing up) — preserving that self-heal behavior exactly as before, including that it's still
  scoped to `PENDING` only (a `REVOKED` membership must never silently reactivate just because
  `resolveInitialMembershipState` happens to resolve ACTIVE — kept that guard explicit rather than
  loosening it while refactoring).
- Verified: `tsc --noEmit`, `eslint src/lib/auth/rbac.ts`, `next build` — all clean, all routes still
  register. Not something I could load-test against real Clerk rate limits in this environment;
  the fix removes the actual mechanism (an unconditional Backend-API call in the hottest shared
  auth path) rather than a workaround like backoff/retry, so it should resolve the timeouts
  directly — confirm in practice under normal multi-page usage.

**2026-09-04 — Digital Twin chat: replaced n8n with an offline OpenAI + MCP tool-calling agent (Claude)**
- User doesn't want any external workflow dependency (n8n) since the whole stack runs offline —
  asked for the Digital Twin floating chat to connect directly to the backend's own MCP server
  instead, using OpenAI as the model.
- The backend (`InfraMind.py`) already exposed a Bearer-protected MCP server at `POST/GET /mcp`
  (fastapi-mcp, 14 read/report/simulation tools over Postgres/Neo4j — see that repo's `main.py`) —
  nothing to build there, it just had no real client wired up on this side (n8n's own AI Agent node
  was the only thing ever calling it).
- Added `npm install @modelcontextprotocol/sdk` (official TS MCP client) and new
  `src/lib/mcp/client.ts` — a thin singleton wrapper: `Client` + `StreamableHTTPClientTransport`
  pointed at `${NEXT_PUBLIC_API_BASE_URL}/mcp` with the same `NEXT_PUBLIC_API_TOKEN` Bearer token
  every other server-side backend call already uses (matches the convention in
  `src/app/api/fleet/graph/route.ts`). Exports `listMcpTools()` / `callMcpTool(name, args)`; resets
  its cached connection on any failure so the next call reconnects instead of caching a dead client.
- Rewrote `src/app/api/chat/mcp/route.ts`: removed the n8n webhook branch entirely. New primary
  path (`replyWithMcpAgent`) is an OpenAI tool-calling loop modeled directly on the existing
  Scenario Builder AI Copilot pattern (`src/app/api/nl/route.ts` — same round-trip shape, adapted
  from a static in-process tool belt to the MCP server's tools fetched live via `listMcpTools()`):
  fetch tools → send message + history to `gpt-4o-mini` with `tools` → execute any `tool_calls` via
  `callMcpTool` → feed results back → repeat (capped at `MAX_TOOL_ROUNDS = 4`) → return the model's
  final plain-text reply. Falls back to a new `replyFromContextOnly` (the old context-only
  Gemini/OpenAI path via `lib/llm/provider.ts`, unchanged logic) when `OPENAI_API_KEY` isn't set or
  the MCP agent loop throws for any reason (backend down, etc.) — chat degrades gracefully instead
  of hard-failing.
- `.env.local.example`: dropped `N8N_WEBHOOK_URL`, added a real `OPENAI_API_KEY=` line (now
  required for the tool-calling path — previously only implied as Gemini's fallback), documented
  the new flow.
- **Verified live, not just compiled**: `tsc --noEmit` / `eslint` / `next build` all clean, all API
  routes still register. Beyond that, ran two standalone smoke tests against the actual running
  stack (deleted after, not committed): (1) raw MCP client — connected, listed all 14 tools, called
  `get_fleet_summary` and got real data back (46 nodes — the 43-node Waters demo seed plus the 3
  starter nodes, confirming that seed is loaded); (2) the full OpenAI agent loop with a real
  question ("how many nodes are critical or offline, name a couple") — the model correctly chose to
  call `get_fleet_summary` then `list_nodes` and answered from the real tool results. Noted for
  whoever picks this up next: the model's *choice of which two example nodes to name* wasn't the
  most representative pick available (LLM example-selection imprecision, not a plumbing bug — the
  tool calls and data returned were correct) — worth a prompt tweak if it recurs, not a code fix.

**2026-09-04 — New backend demo seed: 43-node Waters Corporation topology (Claude)**
- Context-only entry — all the work is in `InfraMind.py` (separate repo), no frontend code
  changed. User asked for "a nice and big infrastructure architecture for Waters Corporation for
  showing in the demo"; the backend's default seed (`scripts/init_db.py`/`init_graph.py`) is only
  a 3-node web→app→db starter graph, too sparse for the Digital Twin / blast-radius / predictive-
  maintenance demos.
- New `InfraMind.py/scripts/seed_waters_demo.py` (manual-run only — `python
  scripts/seed_waters_demo.py`, not wired into docker-compose's startup command) seeds 43 nodes /
  72 relationships across five sites (Milford-DC1 Americas HQ, Milford-LabWing,
  Wexford-DC EMEA, Singapore-DC APAC, Public Cloud), reusing the same product names this repo's
  own `src/lib/mockData/mockGraph.ts` already uses (Empower, NuGenesis, UNIFI, ActiveDirectory,
  Citrix, IIS, Wildfly, Tomcat, VMware) so mock and live data tell the same story, extended with a
  full network/virtualization/storage/monitoring layer. Idempotent (deterministic node IDs), and
  seeds a Metric row + (for unhealthy nodes) an Alert row per node so the health grid and alerts
  panel aren't empty either. With `NEXT_PUBLIC_USE_MOCK=false` this repo's Digital Twin page will
  render that live seeded graph directly once the backend seed script has been run — no frontend
  change needed to see it.
- Full detail in `InfraMind.py/context/DEVELOPMENT_STATUS.md`'s 2026-09-04 AGENT NOTES.

**2026-09-04 — Removed Supabase from the backend repo; reverted to local Postgres (Claude)**
- Context-only entry for this repo — all the actual changes were in `InfraMind.py` (separate repo).
  User hit `network supabase_default declared as external, but could not be found` running
  `docker compose up` there, and clarified they'd asked for Supabase to be removed completely and
  the backend reverted to how it was before, with the frontend's MongoDB staying local (it already
  was — `.env.local.example`'s `MONGODB_URL`/`MONGODB_URI` already pointed at
  `mongodb://inframind:inframind@localhost:27017`, the `mongo` service in `InfraMind.py`'s
  `docker-compose.yml`, not Atlas or anything Supabase-related — no frontend change was needed here).
- What happened on the backend: an earlier "supabase migration" commit had replaced the plain
  `postgres:16` container with a self-hosted Supabase stack (`InfraMind.py/supabase/`, a separate
  compose project) joined via an `external: true` `supabase_default` Docker network — so
  `InfraMind.py`'s own `docker compose up` would always fail with that error unless the Supabase
  stack's compose file had already been started first to create that network. A later commit had
  restored the `mongo` service (frontend's DB) but never reverted the Postgres/Supabase side, which
  is what was still breaking.
- Fix (in `InfraMind.py`, commit `4514ea2`): `git revert` of the supabase-migration commit — brought
  back the local `postgres:16` service, dropped the `supabase_default` external network + Supabase
  env vars (`SUPABASE_POSTGRES_PASSWORD`), reverted `backend/config.py` / `backend/database/postgres.py`
  / `scripts/init_db.py` to pre-Supabase, deleted the Supabase-only `scripts/seed_demo_data.py` /
  `scripts/seed_graph_demo.py` (confirmed unreferenced elsewhere first), and deleted the entire
  `supabase/` directory including its untracked (gitignored) generated secrets/data volume. Fixed a
  duplicate `mongo:` service block the auto-merge produced while reconciling with the mongo-restore
  commit. Also hand-edited the real (untracked) `InfraMind.py/.env` to drop
  `SUPABASE_POSTGRES_PASSWORD` and point `POSTGRES_URL` back at local Postgres — git doesn't touch
  untracked files, so the revert alone wouldn't have fixed the actually-running config.
- Full detail lives in `InfraMind.py/context/DEVELOPMENT_STATUS.md`'s AGENT NOTES (2026-09-04 entry).
- No frontend code, config, or docs beyond this entry needed changing.

