'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Bell, Check, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ErrorState, InlineLoader, EmptyState } from '@/components/ui/Loader'
import { alertsService } from '@/services/alerts.service'
import { useStationStore } from '@/store/useStationStore'
import { ASSET_CATEGORIES, ROUTES } from '@/lib/constants'
import type { BackendAlertDetail } from '@/lib/backendAdapters'

const SEVERITIES: BackendAlertDetail['severity'][] = ['info', 'warning', 'critical', 'emergency']
const STATES: BackendAlertDetail['state'][] = ['open', 'acked', 'resolved', 'suppressed']

const severityVariant: Record<BackendAlertDetail['severity'], 'info' | 'warning' | 'critical'> = {
  info: 'info', warning: 'warning', critical: 'critical', emergency: 'critical',
}

export default function AlertsPage() {
  const station = useStationStore((s) => s.station)
  const [alerts, setAlerts] = useState<BackendAlertDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [severity, setSeverity] = useState('')
  const [category, setCategory] = useState('')
  const [state, setState] = useState('open')
  const [ackingId, setAckingId] = useState<string | null>(null)
  const [ackNote, setAckNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await alertsService.list({ station, severity: severity || undefined, category: category || undefined, state: state || undefined })
      setAlerts(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alerts')
    } finally {
      setLoading(false)
    }
  }, [station, severity, category, state])

  useEffect(() => { load() }, [load])

  const handleAck = async (id: string) => {
    try {
      await alertsService.ack(id, ackNote)
      setAckingId(null)
      setAckNote('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to acknowledge alert')
    }
  }

  const handleResolve = async (id: string) => {
    try {
      await alertsService.resolve(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve alert')
    }
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-y-auto bg-brand-bg p-6">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div>
          <h1 className="font-mono text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Bell size={16} className="text-cyan" />
            Alerts — {station.toUpperCase()}
          </h1>
          <p className="text-white/70 text-sm mt-1.5 font-sans">Filter, acknowledge with a note, and jump to the affected asset on the twin.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select value={state} onChange={(e) => setState(e.target.value)} className="bg-brand-surface border border-brand-border rounded px-2 py-1.5 text-xs font-mono text-white/70 focus:outline-none focus:border-cyan/50">
            <option value="">All states</option>
            {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="bg-brand-surface border border-brand-border rounded px-2 py-1.5 text-xs font-mono text-white/70 focus:outline-none focus:border-cyan/50">
            <option value="">All severities</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="bg-brand-surface border border-brand-border rounded px-2 py-1.5 text-xs font-mono text-white/70 focus:outline-none focus:border-cyan/50">
            <option value="">All categories</option>
            {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {loading && <div className="flex justify-center py-16"><InlineLoader text="Loading alerts…" /></div>}
        {error && <ErrorState message={error} onRetry={load} />}
        {!loading && !error && alerts.length === 0 && <EmptyState message="No alerts match your filters" />}

        {!loading && !error && alerts.length > 0 && (
          <div className="space-y-2">
            {alerts.map((a) => (
              <div key={a.id} className="bg-brand-surface border border-brand-border rounded p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant={severityVariant[a.severity]} size="sm" dot>{a.severity}</Badge>
                      <Badge variant="neutral" size="sm">{a.state}</Badge>
                      <span className="font-mono text-[10px] text-white/55 uppercase">{a.category}</span>
                      {a.occurrences > 1 && <span className="font-mono text-[10px] text-white/55">×{a.occurrences}</span>}
                    </div>
                    <p className="text-sm font-sans text-white/90">{a.message}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="font-mono text-[10px] text-white/55">First {new Date(a.first_seen).toLocaleString()}</span>
                      <span className="font-mono text-[10px] text-white/55">Last {new Date(a.last_seen).toLocaleString()}</span>
                      <Link href={ROUTES.TWIN} className="font-mono text-[10px] text-cyan hover:underline flex items-center gap-1">
                        <ExternalLink size={10} /> View on twin
                      </Link>
                    </div>
                    {a.ack_note && <p className="text-[11px] font-mono text-white/62 mt-1.5 italic">Ack note: {a.ack_note}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {a.state === 'open' && (
                      ackingId === a.id ? (
                        <div className="flex flex-col gap-1.5 items-end">
                          <input
                            value={ackNote}
                            onChange={(e) => setAckNote(e.target.value)}
                            placeholder="Ack note…"
                            className="bg-brand-bg border border-brand-border rounded px-2 py-1 text-xs text-white w-40 focus:outline-none focus:border-cyan/50"
                          />
                          <div className="flex gap-1">
                            <Button variant="primary" size="sm" onClick={() => handleAck(a.id)}>Confirm</Button>
                            <Button variant="ghost" size="sm" onClick={() => { setAckingId(null); setAckNote('') }}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <Button variant="secondary" size="sm" icon={<Check size={12} />} onClick={() => setAckingId(a.id)}>Ack</Button>
                      )
                    )}
                    {(a.state === 'open' || a.state === 'acked') && (
                      <Button variant="ghost" size="sm" onClick={() => handleResolve(a.id)}>Resolve</Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
