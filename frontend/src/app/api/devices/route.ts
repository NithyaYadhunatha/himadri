// GET — proxies FastAPI's GET /devices?pending= (Device Scalability queue).
// The backend has no `?station=` filter here, so scoping is applied after
// the fetch (like /api/audit) rather than by passing a station param through.
import { forwardStationScopedList, requireMembership } from '@/lib/apiProxy'

type PendingDeviceItem = { asset_id: string; station_id: string }

export async function GET(req: Request) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  return forwardStationScopedList<PendingDeviceItem>(req, '/devices', access.membership)
}
