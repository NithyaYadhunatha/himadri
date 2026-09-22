# HIMADRI Backend Backlog

Last Updated: 2026-09-20

Plain backlog for whoever picks up backend (`InfraMind.py`) work next — no
phase/checkbox automation is set up for this file (unlike
`DEVELOPMENT_STATUS.md`'s phase tracker). Read `PROJECT_CONTEXT.md` and
`DEVELOPMENT_STATUS.md` first.

## Items

- **Real drift detection for `/model-accuracy/drift`.** Currently a
  `random.uniform` placeholder per-feature drift score
  (`backend/routers/predictive_maintenance.py`) — real feature importances
  come from training, but "has the input distribution actually shifted"
  is not computed. Would need a reference distribution snapshot from
  training time to compare live features against.
- **A real scheduler for `backend/analysis/weekly_job.py`.** It exists and
  works as a manual/cron-triggered training entrypoint, but nothing in
  this repo schedules it — retraining only happens via
  `POST /model-accuracy/retrain` today.
- **Decide whether Redis becomes load-bearing for anything.** It is
  provisioned in `docker-compose.yml` but nothing in `backend/` currently
  reads or writes it (verified by grep). Candidates if it's ever needed:
  the heartbeat rate-limiter in `backend/dependencies.py` (currently
  presumably in-process — check before assuming), or
  `backend/services/pending_commands.py`'s in-memory queue if this ever
  needs to run across multiple worker processes.
- **Give the device agent a real way to change an asset's category on the
  backend, if that's ever actually wanted.** Today
  `agent/gui/main_window.py`'s Asset Category selector only changes what
  the LOCAL agent process synthesizes — `HeartbeatRequest` has no category
  field, so there is no live channel to change what the backend thinks an
  `asset_id`'s category is (a real asset's category is fixed at
  registration by `POST /agent/register`). If a demo ever needs this to be
  more than cosmetic, that's a schema/endpoint change, not an agent-only
  fix.
- **Broaden `scripts/seed_predictive_maintenance_demo.py` beyond 4
  assets** if a fuller predictive-maintenance demo is wanted — the current
  scope (3 incident-prone + 1 healthy) was a deliberate, time-boxed choice
  for the InfraMind -> HIMADRI conversion pass, not a hard ceiling. See
  that script's own docstring for the chronological-train/val-split
  failure mode to avoid if you add more incident-prone assets with fewer
  than ~6 incidents each.
- **Verify the whole stack actually runs.** The 2026-09-20 conversion pass
  (agent + scripts + docker naming + docs) had no working Python
  interpreter or Docker available to test with — see
  `DEVELOPMENT_STATUS.md`'s "Verification" section for the exact checklist
  to run through before the next demo.

## Boundary reminder

The RBAC/user-account layer is deliberately Next.js-only (a separate
frontend repo, not in this codebase) — this backend must never learn about
users, roles, or departments. Every mutating endpoint here takes a plain
string (`issued_by`, `approved_by`, `recorded_by`, ...), not a foreign key
into a users table this backend doesn't have. Keep that boundary when
picking up any of the above.
