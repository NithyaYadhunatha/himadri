// POST — proxies FastAPI's POST /advisories/{id}/reject. Ownership check via
// the /advisories list (backend has no single-item GET) — see
// findStationScopedOrNotFound.
import { findStationScopedOrNotFound, forwardToBackend, requireMembership } from '@/lib/apiProxy'

type AdvisoryDetail = { id: string; station_id: string }
type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const { id } = await params
  const found = await findStationScopedOrNotFound<AdvisoryDetail>('/advisories', id, access.membership)
  if (!found.ok) return found.response

  return forwardToBackend(req, `/advisories/${encodeURIComponent(id)}/reject`)
}
