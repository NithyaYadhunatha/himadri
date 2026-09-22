// POST — proxies FastAPI's POST /alerts/{id}/ack (ack with a note).
// Ownership check via the /alerts list (backend has no single-item GET).
import { findStationScopedOrNotFound, forwardToBackend, requireMembership } from '@/lib/apiProxy'
import type { BackendAlertDetail } from '@/lib/backendAdapters'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const { id } = await params
  const found = await findStationScopedOrNotFound<BackendAlertDetail>('/alerts', id, access.membership)
  if (!found.ok) return found.response

  return forwardToBackend(req, `/alerts/${encodeURIComponent(id)}/ack`)
}
