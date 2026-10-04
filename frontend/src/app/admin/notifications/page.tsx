// src/app/admin/notifications/page.tsx
//
// Notification Recipients admin page — restores the old InfraMind
// email-alert-notification feature (frontend + backend), re-adapted to
// HIMADRI's real alert model: an email fires when a station asset alert
// escalates to Critical/Emergency and goes unacked past its timer (FR-60),
// not the old IT-node-down/revenue-at-risk flavor. Recipients are plain
// email addresses, optionally scoped to one station (station_id null =
// every station) — this is operational config, not a user/account, so it
// lives in Postgres on the backend rather than Mongo.
//
// Self-contained new route: nothing else needs to change to add this page.
// Gated by src/app/admin/layout.tsx (STATION_LEADER/HQ_OPERATOR) — no nav
// link wired yet, see the TODO left in the task report.
'use client'

import { useEffect, useState, useCallback } from 'react'
import { Bell, Mail, Trash2, Plus, Send, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { STATIONS, STATION_LABELS, type StationId } from '@/lib/constants'
import {
  notificationsService,
  type NotificationRecipient,
} from '@/services/notifications.service'

const selectClass =
  'bg-brand-bg border border-brand-border rounded text-xs text-white/80 px-2 py-1.5 focus:border-cyan outline-none'

const inputClass =
  'w-full bg-brand-bg border border-brand-border rounded text-sm text-white px-3 py-2 focus:border-cyan outline-none placeholder:text-white/55'

function stationLabel(stationId: string | null): string {
  if (stationId === null) return 'All stations'
  return STATION_LABELS[stationId as StationId] ?? stationId
}

export default function AdminNotificationsPage() {
  const [recipients, setRecipients] = useState<NotificationRecipient[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newStation, setNewStation] = useState<'' | StationId>('')
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const [testEmail, setTestEmail] = useState('')
  const [testStation, setTestStation] = useState<'' | StationId>('')
  const [testBusy, setTestBusy] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await notificationsService.list()
      setRecipients(data)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load recipients')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const addRecipient = async () => {
    setAddError(null)
    if (!newEmail.includes('@')) {
      setAddError('Enter a valid email address')
      return
    }
    setAddBusy(true)
    try {
      await notificationsService.create({
        email: newEmail.trim(),
        name: newName.trim() || null,
        station_id: newStation || null,
        active: true,
      })
      setNewEmail('')
      setNewName('')
      setNewStation('')
      await load()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add recipient')
    } finally {
      setAddBusy(false)
    }
  }

  const toggleActive = async (recipient: NotificationRecipient) => {
    setBusyId(recipient.id)
    try {
      await notificationsService.update(recipient.id, { active: !recipient.active })
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const removeRecipient = async (id: string) => {
    setBusyId(id)
    try {
      await notificationsService.remove(id)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const sendTest = async () => {
    setTestError(null)
    setTestResult(null)
    setTestBusy(true)
    try {
      const result = await notificationsService.sendTest({
        email: testEmail.trim() || undefined,
        station_id: testStation || undefined,
      })
      setTestResult(
        result.api_key_configured
          ? `Sent ${result.sent}/${result.attempted} test email(s).`
          : `Dry run (no RESEND_API_KEY configured on the backend) — would have sent to ${result.attempted} recipient(s).`,
      )
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Failed to send test email')
    } finally {
      setTestBusy(false)
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-cyan/10 border border-cyan/40 flex items-center justify-center">
          <Bell size={16} className="text-cyan" />
        </div>
        <div>
          <h1 className="font-mono text-sm font-semibold tracking-widest text-white uppercase">
            Alert Notification Recipients
          </h1>
          <p className="text-xs text-white/62 mt-0.5">
            Emailed when a station asset alert escalates to Critical/Emergency and goes unacknowledged (FR-60).
          </p>
        </div>
      </div>

      <Card>
        <CardHeader title="Add Recipient" subtitle="Optionally scope to one station — leave unscoped to notify on every station's escalations" />
        <div className="mt-4 flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <label className="text-[11px] text-white/62 uppercase tracking-wider">Email</label>
            <div className="relative mt-1">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/55" />
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="person@ncpor.gov.in"
                className={`${inputClass} pl-9`}
              />
            </div>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="text-[11px] text-white/62 uppercase tracking-wider">Name (optional)</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Station Leader"
              className={`${inputClass} mt-1`}
            />
          </div>
          <div>
            <label className="text-[11px] text-white/62 uppercase tracking-wider">Station</label>
            <select
              className={`${selectClass} mt-1 block`}
              value={newStation}
              onChange={(e) => setNewStation(e.target.value as '' | StationId)}
            >
              <option value="">All stations</option>
              {STATIONS.map((s) => (
                <option key={s} value={s}>
                  {STATION_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <Button variant="primary" size="md" icon={<Plus size={14} />} loading={addBusy} onClick={addRecipient}>
            Add Recipient
          </Button>
        </div>
        {addError && <p className="text-crimson text-xs mt-2">{addError}</p>}
      </Card>

      <Card noPad>
        <div className="p-4 border-b border-brand-border">
          <CardHeader title="Recipients" subtitle={`${recipients.length} configured`} />
        </div>
        {loading ? (
          <div className="p-6 flex justify-center text-white/62">
            <Loader2 className="animate-spin" size={18} />
          </div>
        ) : loadError ? (
          <div className="p-6 text-center text-crimson text-sm">{loadError}</div>
        ) : recipients.length === 0 ? (
          <div className="p-6 text-center text-white/62 text-sm">No recipients configured yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/62 text-xs uppercase tracking-wider">
                <th className="px-4 py-2 font-normal">Email</th>
                <th className="px-4 py-2 font-normal">Name</th>
                <th className="px-4 py-2 font-normal">Station</th>
                <th className="px-4 py-2 font-normal">Status</th>
                <th className="px-4 py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((r) => (
                <tr key={r.id} className="border-t border-brand-border">
                  <td className="px-4 py-2 text-white/80">{r.email}</td>
                  <td className="px-4 py-2 text-white/75">{r.name ?? '—'}</td>
                  <td className="px-4 py-2 text-white/75">{stationLabel(r.station_id)}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => toggleActive(r)}
                      disabled={busyId === r.id}
                      className={`inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider rounded px-1.5 py-0.5 border ${
                        r.active
                          ? 'text-emerald bg-emerald/10 border-emerald/30'
                          : 'text-white/62 bg-white/5 border-white/10'
                      }`}
                    >
                      {r.active ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                      {r.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-2">
                    <Button
                      variant="danger"
                      size="sm"
                      icon={<Trash2 size={12} />}
                      loading={busyId === r.id}
                      onClick={() => removeRecipient(r.id)}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Send Test Email"
          subtitle="Fires a sample Critical-escalation email so you can see the format without waiting for a real alert"
        />
        <div className="mt-4 flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <label className="text-[11px] text-white/62 uppercase tracking-wider">Send to (optional)</label>
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="Leave blank to send to all active recipients"
              className={`${inputClass} mt-1`}
            />
          </div>
          <div>
            <label className="text-[11px] text-white/62 uppercase tracking-wider">Station</label>
            <select
              className={`${selectClass} mt-1 block`}
              value={testStation}
              onChange={(e) => setTestStation(e.target.value as '' | StationId)}
            >
              <option value="">All stations</option>
              {STATIONS.map((s) => (
                <option key={s} value={s}>
                  {STATION_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <Button variant="secondary" size="md" icon={<Send size={14} />} loading={testBusy} onClick={sendTest}>
            Send Test Email
          </Button>
        </div>
        {testResult && <p className="text-emerald text-xs mt-2">{testResult}</p>}
        {testError && <p className="text-crimson text-xs mt-2">{testError}</p>}
      </Card>
    </div>
  )
}
