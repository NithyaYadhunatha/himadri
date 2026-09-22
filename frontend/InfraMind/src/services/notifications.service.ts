// src/services/notifications.service.ts
//
// Notification Recipients admin page — restores the old InfraMind
// email-alert-notification feature, re-adapted to HIMADRI's real alert
// model (a station asset alert escalating to Critical/Emergency, FR-60)
// instead of the old IT-node-down/revenue-at-risk flavor. Recipients are
// plain email addresses (not a user/account concept — the backend never
// learns about users/roles, see backend/context/BACKLOG.md's "Boundary
// reminder"), optionally scoped to one station (null = every station).
// Falls back to lib/mockData/mockNotificationRecipients.ts when
// NEXT_PUBLIC_USE_MOCK is set.

import { USE_MOCK } from '@/lib/constants'
import { mockNotificationRecipients } from '@/lib/mockData/mockNotificationRecipients'

export interface NotificationRecipient {
  id: string
  email: string
  name: string | null
  station_id: string | null
  active: boolean
  created_at: string
}

export interface CreateNotificationRecipientInput {
  email: string
  name?: string | null
  station_id?: string | null
  active?: boolean
}

export interface UpdateNotificationRecipientInput {
  email?: string
  name?: string | null
  station_id?: string | null
  active?: boolean
}

export interface SendTestResult {
  attempted: number
  sent: number
  api_key_configured: boolean
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  return res.json()
}

let mockIdSeq = 1000

export const notificationsService = {
  list: async (): Promise<NotificationRecipient[]> => {
    if (USE_MOCK) return Promise.resolve([...mockNotificationRecipients])
    return json(await fetch('/api/admin/notification-recipients'))
  },

  create: async (input: CreateNotificationRecipientInput): Promise<NotificationRecipient> => {
    if (USE_MOCK) {
      const recipient: NotificationRecipient = {
        id: `mock-recipient-${mockIdSeq++}`,
        email: input.email,
        name: input.name ?? null,
        station_id: input.station_id ?? null,
        active: input.active ?? true,
        created_at: new Date().toISOString(),
      }
      mockNotificationRecipients.unshift(recipient)
      return Promise.resolve(recipient)
    }
    return json(
      await fetch('/api/admin/notification-recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    )
  },

  update: async (id: string, input: UpdateNotificationRecipientInput): Promise<NotificationRecipient> => {
    if (USE_MOCK) {
      const recipient = mockNotificationRecipients.find((r) => r.id === id)
      if (!recipient) return Promise.reject(new Error('Recipient not found'))
      Object.assign(recipient, input)
      return Promise.resolve(recipient)
    }
    return json(
      await fetch(`/api/admin/notification-recipients/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    )
  },

  remove: async (id: string): Promise<void> => {
    if (USE_MOCK) {
      const idx = mockNotificationRecipients.findIndex((r) => r.id === id)
      if (idx !== -1) mockNotificationRecipients.splice(idx, 1)
      return Promise.resolve()
    }
    await json(await fetch(`/api/admin/notification-recipients/${encodeURIComponent(id)}`, { method: 'DELETE' }))
  },

  sendTest: async (opts: { email?: string; station_id?: string | null }): Promise<SendTestResult> => {
    if (USE_MOCK) {
      const targets = opts.email
        ? [opts.email]
        : mockNotificationRecipients.filter((r) => r.active && (!opts.station_id || r.station_id === null || r.station_id === opts.station_id)).map((r) => r.email)
      return Promise.resolve({ attempted: targets.length, sent: targets.length, api_key_configured: false })
    }
    return json(
      await fetch('/api/admin/notification-recipients/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      }),
    )
  },
}
