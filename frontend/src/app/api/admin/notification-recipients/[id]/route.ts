// PATCH/DELETE — proxy FastAPI's PATCH/DELETE /notification-recipients/{id}.
// Same admin-only gate as the collection route (see ../route.ts).
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/rbac'
import { backendFetch } from '@/lib/apiProxy'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const check = await requireRole(['STATION_LEADER', 'HQ_OPERATOR'])
  if (!check.ok) return check.response

  const { id } = await params
  const body = await req.text().catch(() => undefined)

  let res: Response
  try {
    res = await backendFetch(`/notification-recipients/${encodeURIComponent(id)}`, { method: 'PATCH', body })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
  const text = await res.text()
  if (!res.ok) {
    return NextResponse.json({ error: text || `Backend ${res.status}` }, { status: res.status })
  }
  return NextResponse.json(text ? JSON.parse(text) : {})
}

export async function DELETE(_req: Request, { params }: Params) {
  const check = await requireRole(['STATION_LEADER', 'HQ_OPERATOR'])
  if (!check.ok) return check.response

  const { id } = await params

  let res: Response
  try {
    res = await backendFetch(`/notification-recipients/${encodeURIComponent(id)}`, { method: 'DELETE' })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
  const text = await res.text()
  if (!res.ok) {
    return NextResponse.json({ error: text || `Backend ${res.status}` }, { status: res.status })
  }
  return NextResponse.json(text ? JSON.parse(text) : { ok: true })
}
