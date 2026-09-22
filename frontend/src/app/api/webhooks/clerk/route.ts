// src/app/api/webhooks/clerk/route.ts
//
// Clerk webhook: keeps Mongo's User/Membership in sync with Clerk identity
// events. Signature-verified with svix using CLERK_WEBHOOK_SECRET — this
// route is intentionally public (see middleware.ts) since Clerk calls it
// server-to-server with no session, but the signature check is what actually
// authenticates the request.

import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { Webhook } from 'svix'
import { dbConnect } from '@/lib/mongodb'
import { User } from '@/lib/models/User'
import { Membership } from '@/lib/models/Membership'
import { resolveInitialMembershipState } from '@/lib/auth/provisioning'

interface ClerkUserEvent {
  type: string
  data: {
    id: string
    email_addresses?: { id: string; email_address: string }[]
    primary_email_address_id?: string
    first_name?: string | null
    last_name?: string | null
    public_metadata?: Record<string, unknown> | null
  }
}

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CLERK_WEBHOOK_SECRET not configured' }, { status: 500 })
  }

  const headerList = await headers()
  const svixId = headerList.get('svix-id')
  const svixTimestamp = headerList.get('svix-timestamp')
  const svixSignature = headerList.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 })
  }

  const payload = await req.text()

  let event: ClerkUserEvent
  try {
    const wh = new Webhook(secret)
    event = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkUserEvent
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  await dbConnect()

  if (event.type === 'user.created') {
    const clerkUserId = event.data.id
    const primaryEmail =
      event.data.email_addresses?.find((e) => e.id === event.data.primary_email_address_id)?.email_address ??
      event.data.email_addresses?.[0]?.email_address ??
      ''
    const name = [event.data.first_name, event.data.last_name].filter(Boolean).join(' ') || primaryEmail || clerkUserId

    const user = await User.findOneAndUpdate(
      { clerkUserId },
      { clerkUserId, email: primaryEmail, name },
      { upsert: true, new: true }
    )

    const existingMembership = await Membership.findOne({ clerkUserId })
    if (!existingMembership) {
      const state = resolveInitialMembershipState(primaryEmail, event.data.public_metadata)
      const inviter = state.invitedByEmail ? await User.findOne({ email: state.invitedByEmail }) : null

      await Membership.create({
        userId: user._id,
        clerkUserId,
        department: state.department,
        role: state.role,
        status: state.status,
        invitedBy: inviter?._id ?? null,
        invitedAt: state.status === 'ACTIVE' ? new Date() : null,
        activatedAt: state.status === 'ACTIVE' ? new Date() : null,
      })
    }
  }

  if (event.type === 'user.deleted') {
    const clerkUserId = event.data.id
    if (clerkUserId) {
      await Membership.updateMany({ clerkUserId }, { status: 'REVOKED' })
    }
  }

  return NextResponse.json({ received: true })
}
