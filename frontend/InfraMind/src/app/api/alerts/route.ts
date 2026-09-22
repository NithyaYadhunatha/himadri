// GET — proxies FastAPI's GET /alerts (station/severity/category/state
// filters pass through as query params), station-scoped: a station-locked
// caller is confined to their own station (defaulted if `?station=` is
// omitted, 403 if they ask for the other one).
import { forwardToBackendWithStation, requireMembership, resolveStationParam } from '@/lib/apiProxy'

export async function GET(req: Request) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const { searchParams } = new URL(req.url)
  const stationResult = resolveStationParam(searchParams, access.membership)
  if (!stationResult.ok) return stationResult.response

  return forwardToBackendWithStation(req, '/alerts', stationResult.station)
}
