// POST — proxies FastAPI's POST /convoys/{id}/assign (assign members/vehicles).
// Ownership check via the /convoys list (backend has no single-item GET).
import { findStationScopedOrNotFound, forwardToBackend, requireMembership } from '@/lib/apiProxy'

type ConvoyDetail = { id: string; station_id: string }
type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const { id } = await params
  const found = await findStationScopedOrNotFound<ConvoyDetail>('/convoys', id, access.membership)
  if (!found.ok) return found.response

  return forwardToBackend(req, `/convoys/${encodeURIComponent(id)}/assign`)
}
