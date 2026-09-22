// src/app/api/logs/route.ts
//
// GET /api/logs — paginated ActivityLog query, admin-only.
//
// Query params:
//   actorEmail   — substring match (case-insensitive)
//   action       — substring match (ignored when auditOnly=true)
//   department   — exact enum value from DEPARTMENTS
//   dateFrom     — ISO date string, inclusive start (00:00:00 of that day)
//   dateTo       — ISO date string, inclusive end (23:59:59 of that day)
//   auditOnly    — "true" to restrict to security-sensitive actions only
//   page         — 1-based, default 1
//   limit        — default 50, max 100
//
// Returns: { logs, total, page, limit, pages }
import { NextRequest, NextResponse } from 'next/server'
import { dbConnect } from '@/lib/mongodb'
import { ActivityLog } from '@/lib/models/ActivityLog'
import { requireRole } from '@/lib/auth/rbac'
import { DEPARTMENTS } from '@/lib/auth/constants'

// Actions that surface in the Audit Log preset: team lifecycle, architecture
// sharing, remediation, and invitation management — all security-sensitive
// mutations that admins need to review independently of the general feed.
export const AUDIT_ACTIONS = [
  'member.approve',
  'member.revoke',
  'member.update',
  'architecture.share',
  'architecture.delete',
  'remediation.execute',
  'invitation.send',
  'invitation.revoke',
] as const

export async function GET(req: NextRequest) {
  const auth = await requireRole(['STATION_LEADER', 'HQ_OPERATOR'])
  if (!auth.ok) return auth.response

  await dbConnect()

  const sp = req.nextUrl.searchParams
  const actorEmail = sp.get('actorEmail')?.trim() || null
  const action = sp.get('action')?.trim() || null
  const department = sp.get('department') || null
  const dateFrom = sp.get('dateFrom') || null
  const dateTo = sp.get('dateTo') || null
  const auditOnly = sp.get('auditOnly') === 'true'
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '50', 10)))

  const query: Record<string, unknown> = {}

  if (actorEmail) {
    query.actorEmail = { $regex: actorEmail, $options: 'i' }
  }

  if (auditOnly) {
    query.action = { $in: AUDIT_ACTIONS }
  } else if (action) {
    query.action = { $regex: action, $options: 'i' }
  }

  if (department && (DEPARTMENTS as readonly string[]).includes(department)) {
    query.department = department
  }

  if (dateFrom || dateTo) {
    const dateFilter: Record<string, Date> = {}
    if (dateFrom) dateFilter.$gte = new Date(dateFrom)
    if (dateTo) {
      const end = new Date(dateTo)
      end.setHours(23, 59, 59, 999)
      dateFilter.$lte = end
    }
    query.createdAt = dateFilter
  }

  const [total, logs] = await Promise.all([
    ActivityLog.countDocuments(query),
    ActivityLog.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('actorEmail action targetType targetId metadata department createdAt')
      .lean(),
  ])

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: String(l._id),
      actorEmail: l.actorEmail,
      action: l.action,
      targetType: l.targetType,
      targetId: l.targetId ?? null,
      metadata: l.metadata ?? null,
      department: l.department ?? null,
      createdAt: l.createdAt,
    })),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  })
}
