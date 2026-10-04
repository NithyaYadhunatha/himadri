// src/app/admin/notifications/page.tsx
//
// Alert notifications admin — the email half of the alert pipeline (the in-app
// half is the bell in the header). An email fires when a station asset alert
// escalates to Critical/Emergency and goes unacknowledged past its 15-minute
// timer (FR-60). Recipients are plain addresses, optionally scoped to one
// station (station_id null = every station); the backend keeps a delivery log
// of every attempt (sent / dry-run / failed) which is shown here.
//
// Gated by src/app/admin/layout.tsx (STATION_LEADER/HQ_OPERATOR).
'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Bell, BellRing, Mail, Trash2, Plus, Send, Loader2, CheckCircle2, XCircle, MailCheck, ServerCrash, Timer, Radio } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Kpi, Panel, PageHead, Pill, type Tone } from '@/components/ui/kit'
import { STATIONS, STATION_LABELS, type StationId } from '@/lib/constants'
import { ago } from '@/lib/format'
import {
  notificationsService,
  type NotificationLogEntry,
  type NotificationRecipient,
} from '@/services/notifications.service'

const selectClass =
  'rounded-lg border border-brand-border bg-brand-surface px-3 py-2.5 text-[14px] text-white focus:border-cyan focus:ring-2 focus:ring-cyan/20 outline-none'

function stationLabel(stationId: string | null): string {
  if (stationId === null) return 'All stations'
  return STATION_LABELS[stationId as StationId] ?? stationId
}

const STATUS_TONE: Record<string, Tone> = { sent: 'ok', dry_run: 'warn', failed: 'crit' }
const STATUS_TEXT: Record<string, string> = { sent: 'delivered', dry_run: 'dry run', failed: 'failed' }
const SEV_TONE: Record<string, Tone> = { emergency: 'crit', critical: 'crit', warning: 'warn', info: 'primary' }

// The escalation policy as the backend actually runs it (alert_engine.py +
// email_service.py) — shown so operators know exactly when mail goes out.
const POLICY = [
  { icon: Radio, t: 'Alert raised', d: 'A rule trips on live telemetry. It appears in the bell and on the Alerts page straight away.', tone: 'primary' as Tone },
  { icon: BellRing, t: 'Operator window · 15 min', d: 'Critical and Emergency alerts wait for someone to acknowledge. Acknowledge or resolve to stop the clock.', tone: 'warn' as Tone },
  { icon: Timer, t: 'Escalates automatically', d: 'Still open after 15 minutes → marked ESCALATED and broadcast to every connected console.', tone: 'crit' as Tone },
  { icon: MailCheck, t: 'Email goes out', d: 'Every active recipient for that station (and all fleet-wide recipients) is emailed once, with a link to the asset.', tone: 'ok' as Tone },
]

// Shown only until the first real escalation is logged, so the log is never a
// blank box. Clearly labelled as a sample.
const SAMPLE_LOG: NotificationLogEntry[] = [
  { id: 's1', alert_id: null, station_id: 'maitri', recipient_email: 'station.leader@maitri.ncpor.gov.in', severity: 'critical', subject: '[HIMADRI] CRITICAL escalation — Diesel Generator 2', kind: 'escalation', status: 'sent', error: null, created_at: new Date(Date.now() - 3 * 3_600_000).toISOString() },
  { id: 's2', alert_id: null, station_id: 'maitri', recipient_email: 'hq.ops@ncpor.gov.in', severity: 'critical', subject: '[HIMADRI] CRITICAL escalation — Diesel Generator 2', kind: 'escalation', status: 'sent', error: null, created_at: new Date(Date.now() - 3 * 3_600_000).toISOString() },
  { id: 's3', alert_id: null, station_id: 'bharati', recipient_email: 'station.leader@bharati.ncpor.gov.in', severity: 'emergency', subject: '[HIMADRI] EMERGENCY escalation — Fuel Tank 02 level', kind: 'escalation', status: 'sent', error: null, created_at: new Date(Date.now() - 26 * 3_600_000).toISOString() },
  { id: 's4', alert_id: null, station_id: null, recipient_email: 'hq.ops@ncpor.gov.in', severity: 'critical', subject: '[HIMADRI] TEST — Critical escalation sample', kind: 'test', status: 'sent', error: null, created_at: new Date(Date.now() - 4 * 86_400_000).toISOString() },
]

export default function AdminNotificationsPage() {
  const [recipients, setRecipients] = useState<NotificationRecipient[]>([])
  const [log, setLog] = useState<NotificationLogEntry[]>([])
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
    setLoadError(null)
    try {
      const [r, l] = await Promise.all([notificationsService.list(), notificationsService.log().catch(() => [])])
      setRecipients(r)
      setLog(l)
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
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail.trim())) {
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
        result.attempted === 0
          ? 'No active recipients match — add one above, or enter an address to send to.'
          : result.api_key_configured
            ? `Sent ${result.sent}/${result.attempted} test email(s).`
            : `Dry run — the backend has no RESEND_API_KEY, so ${result.attempted} email(s) were logged but not delivered.`,
      )
      await load()
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Failed to send test email')
    } finally {
      setTestBusy(false)
    }
  }

  const activeCount = recipients.filter((r) => r.active).length
  const sample = !loading && log.length === 0
  const shownLog = sample ? SAMPLE_LOG : log
  const stats = useMemo(
    () => ({
      sent: log.filter((l) => l.status === 'sent').length,
      dry: log.filter((l) => l.status === 'dry_run').length,
      failed: log.filter((l) => l.status === 'failed').length,
    }),
    [log],
  )
  const dryRunMode = stats.dry > 0 && stats.sent === 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1200px] mx-auto px-6 py-7 space-y-6">
        <PageHead
          eyebrow="Admin · Notifications"
          title="Alert notifications."
          sub="In-app alerts appear in the bell instantly. Email goes to the people below when a Critical or Emergency alert is still unacknowledged after 15 minutes."
          right={<Pill tone={activeCount ? 'ok' : 'warn'} dot>{activeCount} active recipient{activeCount === 1 ? '' : 's'}</Pill>}
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
          <Kpi label="Active recipients" value={activeCount} tone={activeCount ? 'ok' : 'warn'} icon={<Bell size={15} />} hint={`${recipients.length} configured`} />
          <Kpi label="Delivered" value={stats.sent} tone="ok" icon={<MailCheck size={15} />} hint="emails accepted by the mailer" />
          <Kpi label="Dry runs" value={stats.dry} tone={stats.dry ? 'warn' : 'ink'} icon={<Mail size={15} />} hint={dryRunMode ? 'no mail key on backend' : 'logged, not delivered'} />
          <Kpi label="Failed" value={stats.failed} tone={stats.failed ? 'crit' : 'ok'} icon={<ServerCrash size={15} />} hint="mailer rejected or unreachable" />
        </div>

        <Panel eyebrow="How it works" title="From alert to inbox">
          <ol className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            {POLICY.map((p, i) => (
              <li key={p.t} className="relative rounded-xl border border-brand-border bg-brand-surface-2/60 p-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-surface border border-brand-border text-cyan"><p.icon size={16} /></span>
                  <span className="font-display text-[22px] leading-none text-white/60">0{i + 1}</span>
                </div>
                <p className="mt-3 text-[15px] font-semibold text-white">{p.t}</p>
                <p className="mt-1 text-[13.5px] text-white/80 leading-snug">{p.d}</p>
              </li>
            ))}
          </ol>
        </Panel>

        <div className="grid xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-6 items-start">
          <Panel eyebrow="Who gets emailed" title="Recipients" right={<Pill tone="mute">{recipients.length} configured</Pill>} pad={false}>
            <div className="px-5 py-4 border-b border-brand-border/70 bg-brand-surface-2/40">
              <div className="flex items-end gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <label className="eyebrow block mb-1.5">Email</label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/60" />
                    <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="person@ncpor.gov.in" className={`${selectClass} w-full pl-10`} />
                  </div>
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="eyebrow block mb-1.5">Name (optional)</label>
                  <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Station Leader" className={`${selectClass} w-full`} />
                </div>
                <div>
                  <label className="eyebrow block mb-1.5">Station</label>
                  <select className={selectClass} value={newStation} onChange={(e) => setNewStation(e.target.value as '' | StationId)}>
                    <option value="">All stations</option>
                    {STATIONS.map((s) => <option key={s} value={s}>{STATION_LABELS[s]}</option>)}
                  </select>
                </div>
                <Button variant="primary" size="lg" icon={<Plus size={14} />} loading={addBusy} onClick={addRecipient}>Add</Button>
              </div>
              {addError && <p className="text-crimson text-[13.5px] mt-2 font-medium">{addError}</p>}
            </div>

            {loading ? (
              <div className="p-8 flex justify-center text-white/70"><Loader2 className="animate-spin" size={18} /></div>
            ) : loadError ? (
              <div className="p-8 text-center text-crimson text-[14px]">{loadError}</div>
            ) : recipients.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="font-display text-[22px] text-white">Nobody is subscribed yet.</p>
                <p className="mt-1 text-[14px] text-white/80 max-w-md mx-auto">
                  Without a recipient, escalations still show in the bell and on the Alerts page but no email is sent. Add the station leader and HQ operations above.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-brand-border/70">
                {recipients.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-5 py-3.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan/10 border border-cyan/30 text-cyan"><Mail size={16} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-white truncate">{r.email}</p>
                      <p className="text-[13px] text-white/75 truncate">{r.name ?? 'No name'} · {stationLabel(r.station_id)} · added {ago(r.created_at)}</p>
                    </div>
                    <button
                      onClick={() => toggleActive(r)}
                      disabled={busyId === r.id}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wider transition ${
                        r.active ? 'border-emerald/40 bg-emerald/10 text-emerald' : 'border-brand-border bg-brand-surface-2 text-white/70'
                      }`}
                    >
                      {r.active ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                      {r.active ? 'Active' : 'Paused'}
                    </button>
                    <Button variant="danger" size="sm" icon={<Trash2 size={12} />} loading={busyId === r.id} onClick={() => removeRecipient(r.id)}>Remove</Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel eyebrow="Check the wiring" title="Send a test email">
            <p className="text-[13.5px] text-white/80 mb-4">Fires a sample Critical escalation so you can see the format and confirm delivery without waiting for a real alert.</p>
            <div className="space-y-3">
              <div>
                <label className="eyebrow block mb-1.5">Send to (optional)</label>
                <input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="Blank = all active recipients" className={`${selectClass} w-full`} />
              </div>
              <div>
                <label className="eyebrow block mb-1.5">Station</label>
                <select className={`${selectClass} w-full`} value={testStation} onChange={(e) => setTestStation(e.target.value as '' | StationId)}>
                  <option value="">All stations</option>
                  {STATIONS.map((s) => <option key={s} value={s}>{STATION_LABELS[s]}</option>)}
                </select>
              </div>
              <Button variant="primary" size="lg" icon={<Send size={14} />} loading={testBusy} onClick={sendTest}>Send test email</Button>
            </div>
            {testResult && <p className="text-emerald text-[13.5px] mt-3 font-medium">{testResult}</p>}
            {testError && <p className="text-crimson text-[13.5px] mt-3 font-medium">{testError}</p>}
            {dryRunMode && (
              <p className="mt-4 rounded-lg border border-amber/40 bg-amber/10 px-3.5 py-2.5 text-[13px] text-white leading-snug">
                <b>Mailer not configured.</b> Set <code className="font-semibold">RESEND_API_KEY</code> on the backend to deliver real email; until then every send is logged as a dry run.
              </p>
            )}
          </Panel>
        </div>

        <Panel
          eyebrow="Delivery log"
          title="Recent notifications"
          right={sample ? <Pill tone="mute">sample — nothing sent yet</Pill> : <Pill tone="primary">last {shownLog.length}</Pill>}
          pad={false}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-brand-border/70">
                  {['When', 'Severity', 'Recipient', 'Subject', 'Status'].map((h) => (
                    <th key={h} className="px-5 py-3 eyebrow font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/60">
                {shownLog.map((l) => (
                  <tr key={l.id} className={`hover:bg-brand-surface-2/60 ${sample ? 'opacity-80' : ''}`}>
                    <td className="px-5 py-3 text-white/80 whitespace-nowrap">{ago(l.created_at)}</td>
                    <td className="px-5 py-3">{l.severity ? <Pill tone={SEV_TONE[l.severity] ?? 'mute'}>{l.severity}</Pill> : '—'}</td>
                    <td className="px-5 py-3 text-white whitespace-nowrap">{l.recipient_email}</td>
                    <td className="px-5 py-3 text-white max-w-[360px] truncate" title={l.error ?? l.subject}>
                      {l.kind === 'test' && <span className="mr-1.5 rounded bg-brand-surface-3 px-1.5 py-0.5 text-[11px] font-semibold uppercase">test</span>}
                      {l.subject.replace('[HIMADRI] ', '')}
                    </td>
                    <td className="px-5 py-3"><Pill tone={STATUS_TONE[l.status] ?? 'mute'}>{STATUS_TEXT[l.status] ?? l.status}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  )
}
