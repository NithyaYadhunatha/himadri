// src/app/api/nodes/[id]/edges/[targetId]/route.ts

import { NextResponse } from 'next/server'
import { getCurrentMembership } from '@/lib/auth/rbac'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://himadri.aus1in.me/api/v1'
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN ?? ''

type Params = { params: Promise<{ id: string; targetId: string }> }

export async function DELETE(req: Request, { params }: Params) {
  const membership = await getCurrentMembership()
  if (!membership) {
    return NextResponse.json({ error: 'Membership not active' }, { status: 403 })
  }

  const { id, targetId } = await params
  
  let res: Response
  try {
    res = await fetch(`${API_BASE}/assets/${encodeURIComponent(id)}/edges/${encodeURIComponent(targetId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${API_TOKEN}` },
      cache: 'no-store',
    })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }

  if (!res.ok) {
    return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  }

  return new NextResponse(null, { status: 200 })
}
