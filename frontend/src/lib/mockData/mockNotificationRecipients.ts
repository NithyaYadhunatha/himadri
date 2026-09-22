// src/lib/mockData/mockNotificationRecipients.ts
//
// Frontend-only fallback for /admin/notifications, gated by
// NEXT_PUBLIC_USE_MOCK. A couple of station-scoped recipients plus one
// fleet-wide (station_id: null) HQ recipient, matching the "null =
// unrestricted" convention used by AlertRule/NotificationRecipient on the
// backend.
import type { NotificationRecipient } from '@/services/notifications.service'

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600_000).toISOString()

export const mockNotificationRecipients: NotificationRecipient[] = [
  {
    id: 'mock-recipient-1',
    email: 'station.leader@maitri.ncpor.gov.in',
    name: 'Maitri Station Leader',
    station_id: 'maitri',
    active: true,
    created_at: daysAgo(30),
  },
  {
    id: 'mock-recipient-2',
    email: 'station.leader@bharati.ncpor.gov.in',
    name: 'Bharati Station Leader',
    station_id: 'bharati',
    active: true,
    created_at: daysAgo(28),
  },
  {
    id: 'mock-recipient-3',
    email: 'hq.ops@ncpor.gov.in',
    name: 'HQ Operations (all stations)',
    station_id: null,
    active: true,
    created_at: daysAgo(45),
  },
]
