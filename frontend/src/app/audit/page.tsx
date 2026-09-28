'use client'

import { useState, useEffect, useCallback } from 'react'
import { ScrollText, ShieldCheck, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ErrorState, InlineLoader, EmptyState } from '@/components/ui/Loader'
import { auditService, type AuditEntry, type AuditVerifyResult } from '@/services/audit.service'
import { useStationStore } from '@/store/useStationStore'

export default function AuditPage() {
  const station = useStationStore((s) => s.station)
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<AuditVerifyResult | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await auditService.list(station)
      setEntries(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit trail')
    } finally {
      setLoading(false)
    }
  }, [station])

  useEffect(() => { load() }, [load])

  const handleVerify = async () => {
    setVerifying(true)
    setVerifyResult(null)
    try {
      const result = await auditService.verify()
      setVerifyResult(result)
    } catch (err) {
      setVerifyResult({ valid: false, checked: 0, broken_at_seq: null, message: err instanceof Error ? err.message : 'Verification failed' })
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="h-screen overflow-y-auto bg-brand-bg p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-mono text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
              <ScrollText size={16} className="text-cyan" />
              Audit Trail — {station.toUpperCase()}
            </h1>
            <p className="text-white/40 text-xs mt-1 font-sans">
              Tamper-evident privileged-action log. Every entry is hash-chained to the previous one.
            </p>
          </div>
          <Button variant="secondary" size="sm" icon={<ShieldCheck size={13} />} loading={verifying} onClick={handleVerify}>
            Verify Integrity
          </Button>
        </div>

        {verifyResult && (
          <div className={`rounded border p-4 flex items-start gap-3 ${verifyResult.valid ? 'border-emerald/30 bg-emerald/10' : 'border-crimson/30 bg-crimson/10'}`}>
            {verifyResult.valid ? <ShieldCheck size={18} className="text-emerald shrink-0" /> : <ShieldAlert size={18} className="text-crimson shrink-0" />}
            <div>
              <p className={`text-sm font-sans font-medium ${verifyResult.valid ? 'text-emerald' : 'text-crimson'}`}>
                {verifyResult.valid ? 'Hash chain verified — no tampering detected' : 'Hash chain broken'}
              </p>
              <p className="text-xs font-mono text-white/50 mt-1">
                {verifyResult.checked} entries checked
                {verifyResult.broken_at_seq !== null && ` · break at seq ${verifyResult.broken_at_seq}`}
              </p>
              {verifyResult.message && <p className="text-xs font-sans text-white/60 mt-1">{verifyResult.message}</p>}
            </div>
          </div>
        )}

        {loading && <div className="flex justify-center py-16"><InlineLoader text="Loading audit trail…" /></div>}
        {error && <ErrorState message={error} onRetry={load} />}
        {!loading && !error && entries.length === 0 && <EmptyState message="No privileged actions logged yet" />}

        {!loading && !error && entries.length > 0 && (
          <div className="bg-brand-surface border border-brand-border rounded overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-brand-bg text-white/40 font-mono uppercase text-[10px]">
                <tr>
                  <th className="text-left px-3 py-2">Seq</th>
                  <th className="text-left px-3 py-2">Actor</th>
                  <th className="text-left px-3 py-2">Action</th>
                  <th className="text-left px-3 py-2">Target</th>
                  <th className="text-left px-3 py-2">Station</th>
                  <th className="text-left px-3 py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.seq} className="border-t border-brand-border">
                    <td className="px-3 py-2 font-mono text-white/30">{e.seq}</td>
                    <td className="px-3 py-2 text-white/70">{e.actor}</td>
                    <td className="px-3 py-2"><Badge variant="info" size="sm">{e.action}</Badge></td>
                    <td className="px-3 py-2 font-mono text-white/50">{e.target ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-white/30 uppercase">{e.station_id ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-white/30">{new Date(e.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
