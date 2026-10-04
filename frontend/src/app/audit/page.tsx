'use client'

import { useState, useEffect, useCallback } from 'react'
import { ShieldCheck, ShieldAlert } from 'lucide-react'
import { PageHead, Pill } from '@/components/ui/kit'
import { STATION_LABELS } from '@/lib/constants'
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
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1200px] mx-auto px-6 py-7 space-y-6">
        <PageHead
          eyebrow={`Audit trail · ${STATION_LABELS[station]}`}
          title="Every privileged action, hash-chained."
          sub="A tamper-evident log of privileged actions. Every entry is chained to the previous one, so editing history breaks the chain and shows up here."
          right={
            <>
              <Pill tone="mute">{entries.length} entries</Pill>
              <Button variant="secondary" size="md" icon={<ShieldCheck size={14} />} loading={verifying} onClick={handleVerify}>
                Verify integrity
              </Button>
            </>
          }
        />

        {verifyResult && (
          <div className={`rounded border p-4 flex items-start gap-3 ${verifyResult.valid ? 'border-emerald/30 bg-emerald/10' : 'border-crimson/30 bg-crimson/10'}`}>
            {verifyResult.valid ? <ShieldCheck size={18} className="text-emerald shrink-0" /> : <ShieldAlert size={18} className="text-crimson shrink-0" />}
            <div>
              <p className={`text-sm font-sans font-medium ${verifyResult.valid ? 'text-emerald' : 'text-crimson'}`}>
                {verifyResult.valid ? 'Hash chain verified — no tampering detected' : 'Hash chain broken'}
              </p>
              <p className="text-xs font-mono text-white/70 mt-1">
                {verifyResult.checked} entries checked
                {verifyResult.broken_at_seq !== null && ` · break at seq ${verifyResult.broken_at_seq}`}
              </p>
              {verifyResult.message && <p className="text-xs font-sans text-white/75 mt-1">{verifyResult.message}</p>}
            </div>
          </div>
        )}

        {loading && <div className="flex justify-center py-16"><InlineLoader text="Loading audit trail…" /></div>}
        {error && <ErrorState message={error} onRetry={load} />}
        {!loading && !error && entries.length === 0 && <EmptyState message="No privileged actions logged yet" />}

        {!loading && !error && entries.length > 0 && (
          <div className="panel overflow-hidden">
            <table className="w-full text-[13.5px]">
              <thead className="bg-brand-surface-2 text-white/75 uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3">Seq</th>
                  <th className="text-left px-4 py-3">Actor</th>
                  <th className="text-left px-4 py-3">Action</th>
                  <th className="text-left px-4 py-3">Target</th>
                  <th className="text-left px-4 py-3">Station</th>
                  <th className="text-left px-4 py-3">When</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.seq} className="border-t border-brand-border">
                    <td className="px-4 py-3 font-mono text-white/55">{e.seq}</td>
                    <td className="px-4 py-3 text-white/70">{e.actor}</td>
                    <td className="px-4 py-3"><Badge variant="info" size="sm">{e.action}</Badge></td>
                    <td className="px-4 py-3 font-mono text-white/70">{e.target ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-white/55 uppercase">{e.station_id ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-white/55">{new Date(e.created_at).toLocaleString()}</td>
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
