// POST — proxies FastAPI's POST /devices/{id}/approve. Ownership check via
// the /devices list (backend has no single-item GET) — the list's item id
// field is `asset_id`, not `id`, so it's checked directly rather than via
// findStationScopedOrNotFound.
import { NextResponse } from 'next/server'
import { backendFetch, forwardToBackend, requireMembership } from '@/lib/apiProxy'
import { isStationRequestAllowed } from '@/lib/graph/departmentScope'

type PendingDeviceItem = { asset_id: string; station_id: string }
type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const { id } = await params

  let res: Response
  try {
    res = await backendFetch('/devices')
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
  if (!res.ok) {
    return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  }
  const devices = (await res.json()) as PendingDeviceItem[]
  const device = devices.find((d) => d.asset_id === id)
  if (!device || !isStationRequestAllowed(device.station_id, access.membership)) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 })
  }

  return forwardToBackend(req, `/devices/${encodeURIComponent(id)}/approve`)
}
