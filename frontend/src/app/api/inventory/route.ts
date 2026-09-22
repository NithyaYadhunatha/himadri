// GET  — proxies FastAPI's GET /inventory?station=&kind=, station-scoped
//        like /api/advisories.
// POST — proxies POST /inventory (no backend handler currently defined for
//        this method — kept forwarding as before; still validates
//        station_id in the body defensively so it's correct if/when the
//        backend adds one).
import { forwardToBackend, forwardToBackendWithStation, requireAllowedStation, requireMembership, resolveStationParam } from '@/lib/apiProxy'

export async function GET(req: Request) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const { searchParams } = new URL(req.url)
  const stationResult = resolveStationParam(searchParams, access.membership)
  if (!stationResult.ok) return stationResult.response

  return forwardToBackendWithStation(req, '/inventory', stationResult.station)
}

export async function POST(req: Request) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const bodyText = await req.text()
  const body = (bodyText ? JSON.parse(bodyText) : null) as { station_id?: string } | null
  const forbidden = requireAllowedStation(body?.station_id, access.membership)
  if (forbidden) return forbidden

  return forwardToBackend(new Request(req.url, { method: 'POST', headers: req.headers, body: bodyText }), '/inventory', { method: 'POST' })
}
