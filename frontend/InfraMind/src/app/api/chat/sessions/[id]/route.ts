// src/app/api/chat/sessions/[id]/route.ts
//
// GET /api/chat/sessions/[id] — fetch a session and its messages in
// chronological order. Used by the CAB page on mount to restore prior
// conversation history.
//
// Returns: { session: ChatSessionDoc, messages: ChatMessageDoc[] }
//
// Auth: any ACTIVE member; ownership-checked (clerkUserId must match).

import { NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { getCurrentMembership } from '@/lib/auth/rbac'
import { dbConnect } from '@/lib/mongodb'
import { ChatSession } from '@/lib/models/ChatSession'
import { ChatMessage } from '@/lib/models/ChatMessage'

export async function GET(
  _req: Request,
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

  await dbConnect()

  const session = await ChatSession.findOne({
    _id: id,
    clerkUserId: membership.clerkUserId,
  }).lean()

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const messages = await ChatMessage.find({ sessionId: session._id })
    .sort({ createdAt: 1 })
    .lean()

  return NextResponse.json({ session, messages })
}
