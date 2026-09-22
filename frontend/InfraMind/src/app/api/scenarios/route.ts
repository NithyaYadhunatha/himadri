// GET  — proxies FastAPI's GET /scenarios (list past runs, optional
//        ?station=), station-scoped like /api/advisories.
// POST — proxies FastAPI's POST /scenarios (run a new What-If scenario).
//        `station_id` is required in the body and must be a station the
//        caller may run scenarios against.
import { forwardToBackend, forwardToBackendWithStation, requireAllowedStation, requireMembership, resolveStationParam } from '@/lib/apiProxy'

export async function GET(req: Request) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const { searchParams } = new URL(req.url)
  const stationResult = resolveStationParam(searchParams, access.membership)
  if (!stationResult.ok) return stationResult.response

  return forwardToBackendWithStation(req, '/scenarios', stationResult.station)
}

export async function POST(req: Request) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const bodyText = await req.text()
  const body = (bodyText ? JSON.parse(bodyText) : null) as { station_id?: string } | null
  const forbidden = requireAllowedStation(body?.station_id, access.membership)
  if (forbidden) return forbidden

  return forwardToBackend(new Request(req.url, { method: 'POST', headers: req.headers, body: bodyText }), '/scenarios', { method: 'POST' })
}
