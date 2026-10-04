// GET — proxies FastAPI's GET /notification-log (delivery log of alert emails:
// sent / dry_run / failed). Same admin-only gate as the recipients routes.
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/rbac'
import { backendFetch } from '@/lib/apiProxy'

export async function GET(req: Request) {
  const check = await requireRole(['STATION_LEADER', 'HQ_OPERATOR'])
  if (!check.ok) return check.response

  const { search } = new URL(req.url)

  let res: Response
  try {
    res = await backendFetch(`/notification-log${search}`)
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
  const text = await res.text()
  if (!res.ok) {
    // An older backend build has no delivery log yet — report it as empty
    // rather than as a hard error so the page still renders.
    if (res.status === 404) return NextResponse.json([])
    return NextResponse.json({ error: text || `Backend ${res.status}` }, { status: res.status })
  }
  return NextResponse.json(text ? JSON.parse(text) : [])
}
