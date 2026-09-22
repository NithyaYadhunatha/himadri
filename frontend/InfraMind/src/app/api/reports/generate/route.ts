// POST — proxies FastAPI's POST /reports/generate (e.g.
// report_type=environmental). `station_id` is nullable (null = fleet-wide
// report); only an HQ/Admin/Auditor caller may generate a fleet-wide report
// or one for a station that isn't their own.
import { forwardToBackend, requireAllowedStationOrFleetWide, requireMembership } from '@/lib/apiProxy'

export async function POST(req: Request) {
  const access = await requireMembership()
  if (!access.ok) return access.response

  const bodyText = await req.text()
  const body = (bodyText ? JSON.parse(bodyText) : null) as { station_id?: string | null } | null
  const forbidden = requireAllowedStationOrFleetWide(body?.station_id, access.membership)
  if (forbidden) return forbidden

  return forwardToBackend(new Request(req.url, { method: 'POST', headers: req.headers, body: bodyText }), '/reports/generate', { method: 'POST' })
}
