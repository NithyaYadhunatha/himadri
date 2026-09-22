// src/app/api/nodes/[id]/edges/route.ts

import { NextResponse } from 'next/server'
import { getCurrentMembership } from '@/lib/auth/rbac'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000'
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN ?? ''

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const membership = await getCurrentMembership()
  if (!membership) {
    return NextResponse.json({ error: 'Membership not active' }, { status: 403 })
  }

  const { id } = await params
  
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}/nodes/${encodeURIComponent(id)}/edges`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_TOKEN}` 
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }

  if (!res.ok) {
    return NextResponse.json({ error: `Backend ${res.status}` }, { status: res.status })
  }

  return new NextResponse(null, { status: 201 })
}
