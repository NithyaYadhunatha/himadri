// GET — proxies FastAPI's GET /analytics/risk?station= (Risk Heatmap).
// `station` is required by the backend (no "all stations" heatmap mode), so
// it's always resolved to a concrete value: the caller's supplied station if
// allowed, else their own station (or 'maitri' for HQ/Admin/Auditor).
import { forwardToBackendWithStation, requireMembership, resolveStationParam } from '@/lib/apiProxy'

export async function GET(req: Request) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const { searchParams } = new URL(req.url)
  const stationResult = resolveStationParam(searchParams, access.membership, { requireStation: true })
  if (!stationResult.ok) return stationResult.response

  return forwardToBackendWithStation(req, '/analytics/risk', stationResult.station)
}
