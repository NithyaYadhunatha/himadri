// src/app/api/chat/sessions/[id]/messages/route.ts
//
// POST /api/chat/sessions/[id]/messages — append one or more messages to a
// session. The CAB page calls this after each successful chat round-trip,
// batching the user turn and assistant reply in a single request so order
// is always preserved.
//
// Body: { messages: { role: 'user' | 'assistant'; content: string }[] }
// Returns: { ok: true, count: number }
//
// Auth: any ACTIVE member; ownership-checked (clerkUserId must match).

import { NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { getCurrentMembership } from '@/lib/auth/rbac'
import { dbConnect } from '@/lib/mongodb'
import { ChatSession } from '@/lib/models/ChatSession'
import { ChatMessage } from '@/lib/models/ChatMessage'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const membership = await getCurrentMembership()
  if (!membership) {
    return NextResponse.json({ error: 'Membership not active' }, { status: 403 })
  }

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid session id' }, { status: 400 })
  }

  let body: { messages?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: 'messages must be a non-empty array' }, { status: 400 })
  }

  await dbConnect()

  // Ownership check — session must belong to this user.
  const session = await ChatSession.findOne({
    _id: id,
    clerkUserId: membership.clerkUserId,
  }).lean()

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const valid = (body.messages as unknown[])
    .filter(
      (m): m is { role: 'user' | 'assistant'; content: string } =>
        typeof m === 'object' &&
        m !== null &&
        (m as Record<string, unknown>).role === 'user' ||
        (typeof m === 'object' &&
          m !== null &&
          (m as Record<string, unknown>).role === 'assistant'),
    )
    .filter(
      (m) =>
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim().length > 0,
    )
    .map((m) => ({
      sessionId: session._id as Types.ObjectId,
      role: m.role as 'user' | 'assistant',
      content: m.content.trim(),
    }))

  if (valid.length === 0) {
    return NextResponse.json({ error: 'No valid messages in array' }, { status: 400 })
  }

  await ChatMessage.insertMany(valid)

  return NextResponse.json({ ok: true, count: valid.length })
}
