// src/lib/auth/permissions.ts
//
// Default RBAC matrix, transcribed from 02-ARCHITECTURE.md §5's RBAC
// matrix. Station scoping (which station's data a non-HQ/Auditor user can
// see) is enforced separately per-query, not here — this only answers
// "can this role do X at all". A few cells in the source matrix are
// qualified ("Science only", "second approver", "by grant", "own station")
// that a flat role->permission list can't fully express; those nuances are
// left as comments for whoever wires the actual per-request scoping check.

import type { Role } from '@/lib/auth/constants'

export const PERMISSIONS = {
  viewOwnStationDashboards: ['STATION_LEADER', 'ENGINEER', 'SCIENTIST', 'HQ_OPERATOR', 'AUDITOR'],
  viewAllStations: ['HQ_OPERATOR', 'AUDITOR'],
  // Scientist can ack alerts, but the matrix qualifies this "Science only"
  // (i.e. category='science' alerts) — enforce that category check alongside this.
  acknowledgeAlerts: ['STATION_LEADER', 'ENGINEER', 'SCIENTIST', 'HQ_OPERATOR'],
  issueStandardCommand: ['STATION_LEADER', 'ENGINEER', 'HQ_OPERATOR'],
  // Engineer is only the *second* approver for a Leader-issued life-safety
  // command (or vice versa) — never the sole approver of their own command.
  approveLifeSafetyCommand: ['STATION_LEADER', 'ENGINEER'],
  acceptEnergyAdvisory: ['STATION_LEADER', 'ENGINEER'],
  editAlertRules: ['STATION_LEADER', 'ENGINEER', 'SCIENTIST', 'HQ_OPERATOR'],
  registerOrApproveDevice: ['STATION_LEADER', 'ENGINEER', 'SCIENTIST', 'HQ_OPERATOR'],
  planConvoy: ['STATION_LEADER', 'ENGINEER', 'HQ_OPERATOR'],
  editInventory: ['STATION_LEADER', 'ENGINEER'],
  runWhatIfSimulations: ['STATION_LEADER', 'ENGINEER', 'SCIENTIST', 'HQ_OPERATOR'],
  // Leader manages users for their own station only; HQ Operator manages
  // across stations — enforce the "own station" restriction at the query level.
  manageTeam: ['STATION_LEADER', 'HQ_OPERATOR'],
  viewAuditLog: ['STATION_LEADER', 'HQ_OPERATOR', 'AUDITOR'],
  exportComplianceReport: ['STATION_LEADER', 'HQ_OPERATOR', 'AUDITOR'],
  // Engineer/Scientist access restricted zones (e.g. Bharati's Satellite
  // Control Room) only "by grant" — a per-user allowlist beyond this matrix.
  accessRestrictedZones: ['STATION_LEADER', 'HQ_OPERATOR'],
} as const satisfies Record<string, readonly Role[]>

export type Permission = keyof typeof PERMISSIONS

export function hasPermission(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false
  return (PERMISSIONS[permission] as readonly Role[]).includes(role)
}
