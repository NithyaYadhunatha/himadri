'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { ShieldCheck, Wrench, Clock, Plus, QrCode, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Dialog } from '@/components/ui/Dialog'
import { ErrorState, InlineLoader } from '@/components/ui/Loader'
import { passportService, type AssetPassport } from '@/services/passport.service'
import { PROVENANCE_LABELS, type Provenance } from '@/lib/constants'

function humanize(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function AssetPassportPage() {
  const params = useParams<{ id: string }>()
  const assetId = params.id
  const [passport, setPassport] = useState<AssetPassport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [url, setUrl] = useState('')

  const [maintType, setMaintType] = useState('Preventive')
  const [maintDesc, setMaintDesc] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [qrOpen, setQrOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await passportService.get(assetId)
      setPassport(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load asset passport')
    } finally {
      setLoading(false)
    }
  }, [assetId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (typeof window !== 'undefined') setUrl(window.location.href)
  }, [])

  const handleLogMaintenance = async () => {
    if (!maintDesc.trim()) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await passportService.logMaintenance(assetId, { type: maintType, description: maintDesc.trim() })
      setMaintDesc('')
      await load()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to log maintenance event')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="h-full flex items-center justify-center"><InlineLoader text="Loading asset passport…" /></div>
  if (error || !passport) return <div className="h-full flex items-center justify-center"><ErrorState message={error ?? 'Not found'} onRetry={load} /></div>

  const provenance = passport.provenance as Provenance

  const healthColor = passport.health_score >= 80 ? '#0F8A6A' : passport.health_score >= 50 ? '#D4820A' : '#C23B3B'

  return (
    <div className="h-full overflow-y-auto bg-brand-bg p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Header — the passport's actual substance (identity/telemetry/
            maintenance below) is the point of this page; the QR is just the
            printable entry mechanism, so it's a small corner trigger here,
            not a permanently-rendered code (see /assets/qr-sheet for the
            printable version this is meant to travel with). */}
        <div className="relative overflow-hidden rounded-xl border border-brand-border p-5" style={{ background: 'linear-gradient(135deg, #08033008 0%, #1D1C930a 100%)' }}>
          <button
            onClick={() => setQrOpen(true)}
            title="Show this passport's QR code"
            className="absolute top-4 right-4 flex items-center justify-center w-9 h-9 rounded-lg border border-brand-border bg-brand-surface text-white/70 hover:text-cyan hover:border-cyan/40 transition-colors"
          >
            <QrCode size={16} />
          </button>
          <h1 className="font-mono text-lg font-bold text-white pr-12">{passport.name}</h1>
          <p className="font-mono text-[11px] text-white/62 mt-1">
            {passport.category}{passport.subtype ? ` / ${passport.subtype}` : ''} · {passport.station_id.toUpperCase()}
            {passport.zone_id ? ` / ${passport.zone_id}` : ''}
          </p>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Badge variant={passport.status === 'ok' ? 'healthy' : passport.status === 'offline' ? 'critical' : 'warning'} size="sm">{passport.status}</Badge>
            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: healthColor, background: `${healthColor}18` }}>
              Health {passport.health_score}
            </span>
            {PROVENANCE_LABELS[provenance] && (
              <span className="text-[10px] font-mono uppercase tracking-wider text-violet-brand bg-violet-brand/10 border border-violet-brand/30 rounded px-1.5 py-0.5">
                {PROVENANCE_LABELS[provenance]}
              </span>
            )}
          </div>
        </div>

        <Dialog open={qrOpen} onClose={() => setQrOpen(false)} title="Asset QR" width="max-w-xs">
          <div className="p-5 flex flex-col items-center gap-4">
            <div className="text-center">
              <p className="font-mono text-xs font-semibold text-white">{passport.name}</p>
              <p className="font-mono text-[10px] text-white/62 uppercase tracking-wider mt-0.5">{passport.id}</p>
            </div>
            {url && (
              <div className="bg-[#FFFFFF] rounded-lg p-3 border border-brand-border">
                <QRCodeSVG value={url} size={180} level="M" />
              </div>
            )}
            <p className="flex items-center gap-1.5 font-mono text-[10px] text-white/62 text-center max-w-[220px] leading-relaxed">
              <Smartphone size={12} className="text-cyan shrink-0" />
              Scan to pull up this asset&rsquo;s passport on a phone in the field.
            </p>
          </div>
        </Dialog>

        <section className="bg-brand-surface border border-brand-border rounded-lg p-4 border-l-4" style={{ borderLeftColor: '#A04FB8' }}>
          <p className="font-mono text-[10px] uppercase tracking-widest mb-3 flex items-center gap-1.5" style={{ color: '#A04FB8' }}>
            <ShieldCheck size={12} /> Identity
          </p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(passport.identity ?? {}).map(([key, value]) => (
              <div key={key} className="bg-brand-bg border border-brand-border rounded p-2">
                <p className="font-mono text-[10px] text-white/62 uppercase">{humanize(key)}</p>
                <p className="font-mono text-xs text-white/80 truncate">{String(value)}</p>
              </div>
            ))}
            {Object.keys(passport.identity ?? {}).length === 0 && (
              <p className="text-xs font-mono text-white/55 italic col-span-2">No identity fields on file.</p>
            )}
          </div>
        </section>

        <section className="bg-brand-surface border border-brand-border rounded-lg p-4 border-l-4" style={{ borderLeftColor: '#1D1C93' }}>
          <p className="font-mono text-[10px] uppercase tracking-widest mb-3 flex items-center gap-1.5" style={{ color: '#1D1C93' }}>
            <Clock size={12} /> 30-Day Telemetry History
          </p>
          {passport.telemetry_history.length === 0 ? (
            <p className="text-xs font-mono text-white/55 italic">No telemetry history recorded.</p>
          ) : (
            <div className="max-h-56 overflow-y-auto space-y-1">
              {passport.telemetry_history.slice(0, 30).map((point, i) => (
                <div key={i} className="flex items-center justify-between text-[11px] font-mono border-b border-brand-border/50 py-1">
                  <span className="text-white/62">{new Date(point.timestamp).toLocaleString()}</span>
                  <span className="text-white/70 truncate max-w-[60%]">
                    {Object.entries(point.values).map(([k, v]) => `${k}: ${v}`).join(', ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-brand-surface border border-brand-border rounded-lg p-4 border-l-4" style={{ borderLeftColor: '#D4820A' }}>
          <p className="font-mono text-[10px] uppercase tracking-widest mb-3 flex items-center gap-1.5" style={{ color: '#D4820A' }}>
            <Wrench size={12} /> Maintenance / Fault Log
          </p>
          <div className="space-y-2 mb-4">
            {passport.maintenance_log.length === 0 ? (
              <p className="text-xs font-mono text-white/55 italic">No maintenance events logged.</p>
            ) : (
              passport.maintenance_log.map((entry) => (
                <div key={entry.id} className="bg-brand-bg border border-brand-border rounded p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[10px] text-cyan uppercase">{entry.type}</span>
                    <span className="font-mono text-[10px] text-white/55">{new Date(entry.logged_at).toLocaleString()}</span>
                  </div>
                  <p className="text-xs font-sans text-white/70">{entry.description}</p>
                  {entry.logged_by && <p className="text-[10px] font-mono text-white/55 mt-1">by {entry.logged_by}</p>}
                </div>
              ))
            )}
          </div>

          <div className="border-t border-brand-border pt-3 space-y-2">
            <p className="font-mono text-[10px] text-white/62 uppercase tracking-widest">Log Maintenance Event</p>
            <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2">
              <select value={maintType} onChange={(e) => setMaintType(e.target.value)} className="bg-brand-bg border border-brand-border rounded px-2 py-2 text-xs text-white focus:outline-none focus:border-cyan/50">
                <option>Preventive</option>
                <option>Corrective</option>
                <option>Inspection</option>
                <option>Calibration</option>
                <option>Readiness Check</option>
              </select>
              <input
                value={maintDesc}
                onChange={(e) => setMaintDesc(e.target.value)}
                placeholder="What was done…"
                className="bg-brand-bg border border-brand-border rounded px-3 py-2 text-xs text-white placeholder:text-white/50 focus:outline-none focus:border-cyan/50"
              />
            </div>
            <Button variant="primary" size="sm" icon={<Plus size={13} />} loading={submitting} disabled={!maintDesc.trim()} onClick={handleLogMaintenance}>
              Log Event
            </Button>
            {submitError && <p className="text-xs font-mono text-crimson">{submitError}</p>}
          </div>
        </section>
      </div>
    </div>
  )
}
