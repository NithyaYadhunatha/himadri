// src/lib/auth/constants.ts
//
// Station/role/status enums shared between server (Mongoose models, API
// routes) and client (admin UI dropdowns). Kept free of any mongoose
// import so client components can pull it in safely.
//
// HIMADRI RBAC (01-SRS.md §2.3 / 02-ARCHITECTURE.md §5): five roles, scoped
// by station rather than corporate department — a Station Leader/Engineer/
// Scientist normally belongs to exactly one of Maitri or Bharati; HQ
// Operator and Auditor are NCPOR-side roles that see both stations.

export const STATIONS = ['MAITRI', 'BHARATI', 'HQ_NCPOR', 'ADMIN'] as const

export const ROLES = [
  'STATION_LEADER',
  'ENGINEER',
  'SCIENTIST',
  'HQ_OPERATOR',
  'AUDITOR',
] as const

export const STATUSES = ['PENDING', 'ACTIVE', 'REVOKED'] as const

export type Station = (typeof STATIONS)[number]
export type Role = (typeof ROLES)[number]
export type MembershipStatus = (typeof STATUSES)[number]

// Backwards-compatible aliases: the Membership schema historically called
// this field "department" (a corporate-IT term) — kept as a type alias so
// files that haven't been touched yet still compile, while new code should
// prefer `Station`/`STATIONS`.
export type Department = Station
export const DEPARTMENTS = STATIONS
