// src/lib/graph/departmentScope.ts
//
// Server-only. Station scoping for the Next.js proxy routes under
// /api/fleet/* and /api/nodes/* that front the FastAPI stations/assets
// endpoints — those routes are the enforcement point; the browser doesn't
// call FastAPI for this data directly.
//
// Unlike the old IT-stack version of this file (which had to fake
// department scoping via an opt-in NodeBusinessMeta tag, because FastAPI's
// old /nodes had no location concept at all), every HIMADRI asset carries
// its own real `station_id` straight from the backend — so scoping here is
// a direct comparison against the membership's station, no side-table
// lookup needed. HQ_NCPOR and ADMIN memberships, and any role granted the
// `viewAllStations` permission (HQ Operator, Auditor — see
// lib/auth/permissions.ts), bypass scoping and see both stations.
import { hasPermission } from '@/lib/auth/permissions'
import type { ActiveMembership } from '@/lib/auth/rbac'

type ScopableMembership = Pick<ActiveMembership, 'department' | 'role'>

/** True when `membership` is allowed to see every station's data (HQ/Admin/Auditor), not just its own. */
export function canViewAllStations(membership: ScopableMembership): boolean {
  return (
    membership.department === 'ADMIN' ||
    membership.department === 'HQ_NCPOR' ||
    hasPermission(membership.role, 'viewAllStations')
  )
}

/** The membership's own station, lowercased to match the `StationId` values
 * (`'maitri' | 'bharati'`) the backend's `station_id` field uses. Null for a
 * membership with no single home station (HQ/Admin). */
export function ownStationId(membership: ScopableMembership): string | null {
  if (membership.department === 'MAITRI') return 'maitri'
  if (membership.department === 'BHARATI') return 'bharati'
  return null
}

/** Filters a list of station-tagged items (assets, graph nodes, alerts, ...)
 * down to what `membership` may see. */
export function scopeByStation<T extends { station_id: string }>(
  items: T[],
  membership: ScopableMembership,
): T[] {
  if (canViewAllStations(membership)) return items
  const own = ownStationId(membership)
  if (!own) return []
  return items.filter((item) => item.station_id === own)
}

/** True when `membership` may request data scoped to `stationId` directly
 * (e.g. a `?station=` query param) — used by routes that fetch one
 * station's data at a time rather than filtering a combined list. */
export function isStationRequestAllowed(stationId: string, membership: ScopableMembership): boolean {
  if (canViewAllStations(membership)) return true
  return ownStationId(membership) === stationId
}

/** The station a membership should default to when no `?station=` is given
 * — their own station, or 'maitri' for an HQ/Admin membership with no
 * single home station. */
export function defaultStationId(membership: ScopableMembership): string {
  return ownStationId(membership) ?? 'maitri'
}
