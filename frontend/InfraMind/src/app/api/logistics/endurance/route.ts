// GET — proxies FastAPI's GET /logistics/endurance?station=. `station` is
// required by the backend (no "all stations" mode), so it's always resolved
// to a concrete value, like /api/analytics/risk.
import { forwardToBackendWithStation, requireMembership, resolveStationParam } from '@/lib/apiProxy'

export async function GET(req: Request) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const { searchParams } = new URL(req.url)
  const stationResult = resolveStationParam(searchParams, access.membership, { requireStation: true })
  if (!stationResult.ok) return stationResult.response

  return forwardToBackendWithStation(req, '/logistics/endurance', stationResult.station)
}
