'use client'

import { useState, useEffect, useCallback } from 'react'
import { Stethoscope, ListChecks, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/Loader'
import { diagnosisService, type DiagnosisCause } from '@/services/diagnosis.service'
import { nodeHealthService } from '@/services/nodeHealth.service'
import { useStationStore } from '@/store/useStationStore'
import { ASSET_CATEGORIES, ASSET_CATEGORY_ABBREV } from '@/lib/constants'
import type { NodeHealth } from '@/types/nodes'
import type { NodeType } from '@/types/graph'

// A representative evidence checklist per category — these are the kinds of
// observed symptoms the guided-diagnosis form lets an engineer flag before
// asking the backend to rank probable causes. The backend's diagnose_fault
// logic owns the actual cause/weight model; this is just the input UI.
const EVIDENCE_BY_CATEGORY: Partial<Record<NodeType, string[]>> = {
  power: ['Engine will not start', 'Output voltage unstable', 'Excessive black smoke', 'Coolant temperature high', 'Load factor above 90%'],
  heating: ['Low supply temperature', 'Filter differential pressure high', 'Burner short-cycling', 'Unusual noise from pump'],
  water: ['Low output flow', 'High pump pressure', 'Discoloured output', 'Storage level dropping unexpectedly'],
  waste: ['Treatment cycle stalled', 'Bioreactor temperature abnormal', 'Sludge pump not running', 'Odour reported'],
  vehicle: ['Will not cold-start', 'Coolant fault code', 'Track tension loose', 'Dashboard display dead'],
  instrument: ['Data continuity dropped', 'Sensor reading out of range', 'Logging software crashed', 'Field cable damage suspected'],
  storage: ['Internal temperature drifting', 'Door/seal not closing fully', 'Compressor running continuously', 'Level sensor mismatch'],
  medical: ['Equipment failed self-test', 'Supply below reorder threshold', 'Backup power not verified'],
  comms: ['Link degraded to PNR-isolated', 'Bandwidth budget exceeded', 'Antenna misalignment suspected'],
  structure: ['Envelope leak reported', 'Access control fault', 'Structural inspection overdue'],
}

export default function DiagnosisPage() {
  const station = useStationStore((s) => s.station)
  const [assets, setAssets] = useState<NodeHealth[]>([])
  const [assetId, setAssetId] = useState<string>('')
  const [category, setCategory] = useState<NodeType | ''>('')
  const [evidence, setEvidence] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [causes, setCauses] = useState<DiagnosisCause[] | null>(null)

  useEffect(() => {
    nodeHealthService.getNodes({}).then((nodes) => {
      setAssets(nodes.filter((n) => !n.stationId || n.stationId === station))
    }).catch(() => {})
  }, [station])

  const selectedAsset = assets.find((a) => a.id === assetId)
  const effectiveCategory = selectedAsset?.type ?? category
  const evidenceOptions = effectiveCategory ? EVIDENCE_BY_CATEGORY[effectiveCategory] ?? [] : []

  const toggleEvidence = (e: string) => {
    setEvidence((prev) => {
      const next = new Set(prev)
      if (next.has(e)) next.delete(e)
      else next.add(e)
      return next
    })
  }

  const runDiagnosis = useCallback(async () => {
    setLoading(true)
    setError(null)
    setCauses(null)
    try {
      const result = await diagnosisService.diagnose({
        asset_id: assetId || undefined,
        category: !assetId && category ? category : undefined,
        evidence: [...evidence],
      })
      setCauses(result.causes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Diagnosis failed')
    } finally {
      setLoading(false)
    }
  }, [assetId, category, evidence])

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-y-auto bg-brand-bg p-6">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div>
          <h1 className="font-mono text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Stethoscope size={16} className="text-cyan" />
            Guided Fault Diagnosis
          </h1>
          <p className="text-white/70 text-sm mt-1.5 font-sans">
            Pick an asset (or a category), flag what you&apos;ve observed, and get ranked probable causes with a
            recommended check sequence.
          </p>
        </div>

        <div className="bg-brand-surface border border-brand-border rounded p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-mono text-[10px] text-white/62 uppercase tracking-widest block mb-1">Asset (optional)</label>
              <select
                value={assetId}
                onChange={(e) => { setAssetId(e.target.value); setEvidence(new Set()) }}
                className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan/60"
              >
                <option value="">— Choose an asset —</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({ASSET_CATEGORY_ABBREV[a.type]})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-mono text-[10px] text-white/62 uppercase tracking-widest block mb-1">
                Category {assetId && <span className="text-white/50">(from selected asset)</span>}
              </label>
              <select
                value={effectiveCategory}
                onChange={(e) => { setCategory(e.target.value as NodeType); setEvidence(new Set()) }}
                disabled={!!assetId}
                className="w-full bg-brand-bg border border-brand-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan/60 disabled:opacity-50"
              >
                <option value="">— Choose a category —</option>
                {ASSET_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {evidenceOptions.length > 0 && (
            <div>
              <label className="font-mono text-[10px] text-white/62 uppercase tracking-widest block mb-2">Observed evidence</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {evidenceOptions.map((e) => (
                  <label key={e} className="flex items-center gap-2 text-xs font-sans text-white/70 bg-brand-bg border border-brand-border rounded px-2.5 py-2 cursor-pointer hover:border-cyan/30">
                    <input type="checkbox" checked={evidence.has(e)} onChange={() => toggleEvidence(e)} className="accent-cyan" />
                    {e}
                  </label>
                ))}
              </div>
            </div>
          )}

          <Button variant="primary" size="sm" icon={<ListChecks size={13} />} loading={loading} disabled={!assetId && !category} onClick={runDiagnosis}>
            Run Diagnosis
          </Button>
        </div>

        {error && <ErrorState message={error} onRetry={runDiagnosis} />}

        {causes && (
          <div className="space-y-3">
            <h2 className="font-mono text-xs font-bold text-white uppercase tracking-widest">Ranked Probable Causes</h2>
            {causes.length === 0 && (
              <p className="text-xs font-mono text-white/55 italic">No causes matched the given evidence.</p>
            )}
            {causes.map((cause, i) => (
              <div key={cause.cause} className="bg-brand-surface border border-brand-border rounded p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-white/55">#{i + 1}</span>
                    <span className="text-sm font-sans font-semibold text-white">{cause.cause}</span>
                  </div>
                  <span className="font-mono text-sm font-bold text-cyan shrink-0">{cause.score_pct.toFixed(0)}%</span>
                </div>
                {cause.matched_evidence.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {cause.matched_evidence.map((ev) => (
                      <span key={ev} className="text-[10px] font-mono text-emerald bg-emerald/10 border border-emerald/20 rounded px-1.5 py-0.5">{ev}</span>
                    ))}
                  </div>
                )}
                {cause.check_sequence.length > 0 && (
                  <div className="mt-2">
                    <p className="font-mono text-[10px] text-white/62 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                      <AlertTriangle size={10} /> Check sequence
                    </p>
                    <ol className="space-y-1 list-decimal list-inside">
                      {cause.check_sequence.map((step, j) => (
                        <li key={j} className="text-xs font-sans text-white/70">{step}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
