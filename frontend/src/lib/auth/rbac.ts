// src/lib/auth/rbac.ts
//
// Server-side access-control helpers. Every authenticated Next.js route/page
// that touches app data (including anything that then calls the FastAPI
// backend) should route through these rather than trusting Clerk's auth()
// alone — Clerk only proves *who* signed in, not whether an Admin has
// granted them a department/role yet.

import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { dbConnect } from '@/lib/mongodb'
import { User } from '@/lib/models/User'
import { Membership, type MembershipDoc, type Department, type Role } from '@/lib/models/Membership'
import { hasPermission, type Permission } from '@/lib/auth/permissions'
import { resolveInitialMembershipState } from '@/lib/auth/provisioning'
import { DEV_BYPASS_AUTH, MOCK_MEMBERSHIP } from '@/lib/auth/devBypass'
import type { ActiveMembership } from '@/lib/auth/rbacTypes'

export type { ActiveMembership } from '@/lib/auth/rbacTypes'

const CLERK_METADATA_AUTH_FALLBACK = process.env.CLERK_METADATA_AUTH_FALLBACK === 'true'

async function getClerkMetadataMembership(clerkUserId: string): Promise<ActiveMembership | null> {
  let email = ''
  let name = clerkUserId
  let publicMetadata: Record<string, unknown> | undefined

  try {
    const clerkUser = await currentUser()
    if (!clerkUser) return null

    email = clerkUser.primaryEmailAddress?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress ?? ''
    name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || email || clerkUserId
    publicMetadata = clerkUser.publicMetadata
  } catch (error) {
    // auth() has already verified the signed Clerk session before this helper
    // runs. If Clerk's Backend API is unavailable, keep the authenticated user
    // in the app's read-only default role rather than crashing the Server
    // Component render. Never infer an admin/invited role without metadata.
    console.error(
      '[auth] Clerk user lookup failed; using read-only membership fallback:',
      error instanceof Error ? error.message : 'Unknown error'
    )
  }

  const state = resolveInitialMembershipState(email, publicMetadata)

  if (state.status !== 'ACTIVE' || !state.role || !state.department) return null

  return {
    membershipId: `clerk:${clerkUserId}`,
    userId: clerkUserId,
    clerkUserId,
    email,
    name,
    department: state.department,
    role: state.role,
    status: 'ACTIVE',
  }
}

// Ensures a User + Membership doc exist for the current Clerk identity,
// creating them with the open-access AUDITOR default unless a bootstrap-admin
// or email-invite rule applies (see lib/auth/provisioning.ts). Safe to call on
// every request — it's a no-op once both docs exist and are already ACTIVE.
//
// Deliberately avoids currentUser() on the common-case fast path (membership
// already exists and is ACTIVE): unlike auth() — which just reads the local
// session JWT, no network call — currentUser() hits Clerk's Backend API over
// the network on every call. This function used to call it unconditionally,
// so every single RBAC-gated request (i.e. nearly every API route in this
// app, including ones on 30s auto-refresh polling) made a Backend API call
// for a value it almost never actually needed, which is what was tripping
// Clerk's rate limit ("too many requests"/timeouts) under normal traffic.
// currentUser() is now only reached for a brand-new membership or a
// legacy-PENDING self-heal check — both rare compared to steady-state traffic
// from already-provisioned ACTIVE users.
async function ensureMembership(): Promise<MembershipDoc & { _id: unknown }> {
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) throw new Error('Not authenticated')

  await dbConnect()

  const membership = await Membership.findOne({ clerkUserId })

  if (membership && membership.status === 'ACTIVE') {
    return membership
  }

  const clerkUser = await currentUser()
  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses?.[0]?.emailAddress ?? ''
  const name = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ') || email || clerkUserId
  const state = resolveInitialMembershipState(email, clerkUser?.publicMetadata)

  if (membership) {
    // Still-PENDING doc: ADMIN_EMAILS/an invite's metadata can resolve
    // differently than they did when this doc was first created (e.g. added
    // to ADMIN_EMAILS afterwards, or the webhook hadn't fired yet) —
    // self-heal rather than requiring a human to hand-edit Mongo. Deliberately
    // scoped to PENDING only — a REVOKED membership must never silently
    // reactivate just because the resolved state happens to be ACTIVE.
    if (membership.status === 'PENDING' && state.status === 'ACTIVE') {
      membership.department = state.department
      membership.role = state.role
      membership.status = 'ACTIVE'
      membership.activatedAt = new Date()
      if (state.invitedByEmail) {
        const inviter = await User.findOne({ email: state.invitedByEmail })
        if (inviter) membership.invitedBy = inviter._id
      }
      await membership.save()
    }
    return membership
  }

  let user = await User.findOne({ clerkUserId })
  if (!user) {
    user = await User.create({ clerkUserId, email, name })
  }

  const inviter = state.invitedByEmail ? await User.findOne({ email: state.invitedByEmail }) : null

  return Membership.create({
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

// Returns the current user's ACTIVE membership, or null if unauthenticated,
// not yet assigned, or revoked. Never throws for the "not active yet" case —
// that's the expected state for a brand-new signup.
export async function getCurrentMembership(): Promise<ActiveMembership | null> {
  if (DEV_BYPASS_AUTH) return MOCK_MEMBERSHIP

  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) return null

  // Explicit standalone mode for a local frontend pointed at the deployed
  // FastAPI service. Avoid touching an unavailable local Mongo instance (and
  // its connection timeout) while still requiring Clerk-verified identity and
  // server-controlled ADMIN_EMAILS/invitation metadata for authorization.
  if (CLERK_METADATA_AUTH_FALLBACK) {
    return getClerkMetadataMembership(clerkUserId)
  }

  const membership: MembershipDoc & { _id: unknown } = await ensureMembership()
  if (membership.status !== 'ACTIVE' || !membership.role || !membership.department) {
    return null
  }

  await dbConnect()
  const user = await User.findById(membership.userId)

  return {
    membershipId: String(membership._id),
    userId: String(membership.userId),
    clerkUserId: membership.clerkUserId,
    email: user?.email ?? '',
    name: user?.name ?? '',
    department: membership.department,
    role: membership.role,
    status: 'ACTIVE',
  }
}

// For server components/pages: redirects unauthenticated users to sign-in.
// A missing active membership can now only represent a revoked/invalid user,
// because ordinary Clerk users receive the open-access AUDITOR default.
export async function requireActiveMembership(): Promise<ActiveMembership> {
  if (DEV_BYPASS_AUTH) return MOCK_MEMBERSHIP

  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) redirect('/sign-in')

  const membership = await getCurrentMembership()
  if (!membership) redirect('/')

  return membership
}

// For API routes: returns a 403 NextResponse if the caller isn't ACTIVE with
// an allowed role, or null if the check passes (caller proceeds normally).
export async function requireRole(allowed: Role[]): Promise<
  { ok: true; membership: ActiveMembership } | { ok: false; response: NextResponse }
> {
  if (DEV_BYPASS_AUTH) return { ok: true, membership: MOCK_MEMBERSHIP }

  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const membership = await getCurrentMembership()
  if (!membership) {
    return { ok: false, response: NextResponse.json({ error: 'Membership not active' }, { status: 403 }) }
  }

  if (!allowed.includes(membership.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { ok: true, membership }
}

// For API routes/server actions that need department-scoped data.
export async function requireDepartment(allowed: Department[]): Promise<
  { ok: true; membership: ActiveMembership } | { ok: false; response: NextResponse }
> {
  if (DEV_BYPASS_AUTH) return { ok: true, membership: MOCK_MEMBERSHIP }

  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const membership = await getCurrentMembership()
  if (!membership) {
    return { ok: false, response: NextResponse.json({ error: 'Membership not active' }, { status: 403 }) }
  }

  // ADMIN department bypasses department scoping — admins see everything.
  if (membership.department !== 'ADMIN' && !allowed.includes(membership.department)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { ok: true, membership }
}

// For API routes that gate a single permission (see lib/auth/permissions.ts)
// rather than an explicit role list.
export async function requirePermission(permission: Permission): Promise<
  { ok: true; membership: ActiveMembership } | { ok: false; response: NextResponse }
> {
  if (DEV_BYPASS_AUTH) return { ok: true, membership: MOCK_MEMBERSHIP }

  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const membership = await getCurrentMembership()
  if (!membership) {
    return { ok: false, response: NextResponse.json({ error: 'Membership not active' }, { status: 403 }) }
  }

  if (!hasPermission(membership.role, permission)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { ok: true, membership }
}
