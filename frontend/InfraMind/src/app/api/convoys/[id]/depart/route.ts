// PATCH — proxies FastAPI's PATCH /convoys/{id}/depart. The backend enforces
// a medical-officer/ambulance-escort validation here — its 400 error message
// is relayed verbatim so the Logistics page can surface exactly why a
// convoy can't depart yet. Ownership check via the /convoys list (backend
// has no single-item GET).
import { findStationScopedOrNotFound, forwardToBackend, requireMembership } from '@/lib/apiProxy'

type ConvoyDetail = { id: string; station_id: string }
type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const { id } = await params
  const found = await findStationScopedOrNotFound<ConvoyDetail>('/convoys', id, access.membership)
  if (!found.ok) return found.response

  return forwardToBackend(req, `/convoys/${encodeURIComponent(id)}/depart`)
}
