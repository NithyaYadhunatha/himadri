// GET — proxies FastAPI's GET /vehicles?station=. The response items don't
// carry a station_id field (see logistics.py's list_vehicles), so scoping
// can't be applied by post-filtering — a station-locked caller's request is
// always resolved to a concrete `station` param instead (defaulted or
// validated), matching /api/analytics/risk. An HQ/Admin/Auditor caller with
// no `?station=` gets every station's vehicles, same as before.
import { forwardToBackendWithStation, requireMembership, resolveStationParam } from '@/lib/apiProxy'

export async function GET(req: Request) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const { searchParams } = new URL(req.url)
  const stationResult = resolveStationParam(searchParams, access.membership)
  if (!stationResult.ok) return stationResult.response

  return forwardToBackendWithStation(req, '/vehicles', stationResult.station)
}
