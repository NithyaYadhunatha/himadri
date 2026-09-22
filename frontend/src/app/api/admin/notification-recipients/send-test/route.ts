// POST — proxies FastAPI's POST /notification-recipients/send-test, which
// fires a realistic sample Critical-escalation email (FR-60 format) so an
// admin can see it without waiting for a real alert to escalate. Same
// admin-only gate as the collection route (see ../route.ts).
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/rbac'
import { backendFetch } from '@/lib/apiProxy'

export async function POST(req: Request) {
  const check = await requireRole(['STATION_LEADER', 'HQ_OPERATOR'])
  if (!check.ok) return check.response

  const body = await req.text().catch(() => undefined)

  let res: Response
  try {
    res = await backendFetch('/notification-recipients/send-test', { method: 'POST', body })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
  const text = await res.text()
  if (!res.ok) {
    return NextResponse.json({ error: text || `Backend ${res.status}` }, { status: res.status })
  }
  return NextResponse.json(text ? JSON.parse(text) : {})
}
