// POST — proxies FastAPI's POST /inventory/{id}/count (manual stock count).
// Ownership check via the /inventory list (backend has no single-item GET).
import { findStationScopedOrNotFound, forwardToBackend, requireMembership } from '@/lib/apiProxy'

type InventoryItemDetail = { id: string; station_id: string }
type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const { id } = await params
  const found = await findStationScopedOrNotFound<InventoryItemDetail>('/inventory', id, access.membership)
  if (!found.ok) return found.response

  return forwardToBackend(req, `/inventory/${encodeURIComponent(id)}/count`)
}
