// src/app/api/chat/sessions/route.ts
//
// POST /api/chat/sessions — create or resume a chat session.
//
// Sessions are unique per (clerkUserId, sessionType, contextKey). Calling
// POST twice with the same trio is idempotent — the existing session doc is
// returned. This lets the CAB page call this on every mount without
// duplicating sessions.
//
// Body: {
//   sessionType: 'cab' | 'mcp' | 'general'
//   contextKey?: string  — e.g. 'simulation_run:<id>' | 'architecture:<id>' | 'none'
//   title?: string       — set on first create only, ignored on resume
// }
// Returns: { session: ChatSessionDoc }
//
// Auth: any ACTIVE member (getCurrentMembership + 403).

import { NextResponse } from 'next/server'
import { getCurrentMembership } from '@/lib/auth/rbac'
import { dbConnect } from '@/lib/mongodb'
import { ChatSession, CHAT_SESSION_TYPES, type ChatSessionType } from '@/lib/models/ChatSession'

export async function POST(req: Request) {
  const membership = await getCurrentMembership()
  if (!membership) {
    return NextResponse.json({ error: 'Membership not active' }, { status: 403 })
  }

  let body: { sessionType?: string; contextKey?: string; title?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.sessionType || !(CHAT_SESSION_TYPES as readonly string[]).includes(body.sessionType)) {
    return NextResponse.json(
      { error: `sessionType must be one of: ${CHAT_SESSION_TYPES.join(', ')}` },
      { status: 400 },
    )
  }

  const sessionType = body.sessionType as ChatSessionType
  const contextKey = body.contextKey?.trim() || 'none'

  await dbConnect()

  // Upsert — create on first call, return existing on subsequent calls.
  // $setOnInsert only fires when the document is new; existing docs are
  // returned as-is so title and other fields aren't overwritten on resume.
  const session = await ChatSession.findOneAndUpdate(
    { clerkUserId: membership.clerkUserId, sessionType, contextKey },
    {
      $setOnInsert: {
        clerkUserId: membership.clerkUserId,
        userEmail: membership.email,
        sessionType,
        contextKey,
        title: body.title?.trim() || null,
      },
    },
    { upsert: true, new: true, lean: true },
  )

  return NextResponse.json({ session })
}
