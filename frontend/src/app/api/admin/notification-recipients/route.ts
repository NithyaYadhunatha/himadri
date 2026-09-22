// GET  — proxies FastAPI's GET /notification-recipients (all recipients;
//        the backend has no `?station=` filter applied by default here, the
//        admin page shows the full list including fleet-wide ones).
// POST — proxies FastAPI's POST /notification-recipients.
//
// Notification recipients are plain operational config, not a user/account
// concept (the backend never learns about users/roles — see
// backend/context/BACKLOG.md's "Boundary reminder"), so this is gated the
// same way src/app/api/admin/members/[id]/route.ts gates its Mongo-backed
// admin resource: requireRole(['STATION_LEADER','HQ_OPERATOR']), on top of
// src/app/admin/layout.tsx's page-level gate.
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/rbac'
import { backendFetch } from '@/lib/apiProxy'

export async function GET() {
  const check = await requireRole(['STATION_LEADER', 'HQ_OPERATOR'])
  if (!check.ok) return check.response

  let res: Response
  try {
    res = await backendFetch('/notification-recipients')
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
  const text = await res.text()
  if (!res.ok) {
    return NextResponse.json({ error: text || `Backend ${res.status}` }, { status: res.status })
  }
  return NextResponse.json(text ? JSON.parse(text) : [])
}

export async function POST(req: Request) {
  const check = await requireRole(['STATION_LEADER', 'HQ_OPERATOR'])
  if (!check.ok) return check.response

  const body = await req.text().catch(() => undefined)

  let res: Response
  try {
    res = await backendFetch('/notification-recipients', { method: 'POST', body })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
  const text = await res.text()
  if (!res.ok) {
    return NextResponse.json({ error: text || `Backend ${res.status}` }, { status: res.status })
  }
  return NextResponse.json(text ? JSON.parse(text) : {}, { status: res.status })
}
