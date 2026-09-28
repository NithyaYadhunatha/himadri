'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, Gauge, X } from 'lucide-react'
import { ErrorState, InlineLoader, EmptyState } from '@/components/ui/Loader'
import { riskService, type RiskCell } from '@/services/risk.service'
import { useStationStore } from '@/store/useStationStore'

function scoreColor(score: number): string {
  if (score >= 70) return '#B23A2E'
  if (score >= 40) return '#B8720F'
  return '#1F9E6D'
}

// Heat-scaled alpha: the tile's fill saturation rises with score (a real
// heatmap reads by intensity, not just hue) — a 12 at 8% opacity and a 90 at
// ~42% opacity look meaningfully different at a glance, not just "green vs
// red text on the same pale card."
function heatAlphaHex(score: number): string {
  const alpha = Math.round(18 + (Math.min(100, Math.max(0, score)) / 100) * 44)
  return alpha.toString(16).padStart(2, '0')
}

function RiskCellTile({ cell, onClick }: { cell: RiskCell; onClick: () => void }) {
  const color = scoreColor(cell.score)
  const fillAlpha = heatAlphaHex(cell.score)
  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col items-start gap-2.5 rounded-lg border p-4 text-left overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg"
      style={{ borderColor: `${color}55`, background: `linear-gradient(160deg, ${color}${fillAlpha} 0%, ${color}0c 100%)` }}
    >
      {/* Heat bar — a literal intensity strip along the top, reinforcing the
          "heatmap" reading beyond just the tinted background. */}
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: color, opacity: cell.score / 100 }} />
      <div className="flex items-center justify-between w-full">
        <span className="font-mono text-[10px] uppercase tracking-widest text-white/60">{cell.label}</span>
        <Gauge size={13} style={{ color }} />
      </div>
      <span className="font-mono text-4xl font-bold leading-none" style={{ color }}>{Math.round(cell.score)}</span>
      <div className="w-full h-1.5 rounded-full bg-brand-bg/60 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, cell.score)}%`, background: color }} />
      </div>
      <span className="font-mono text-[9px] text-white/30 uppercase tracking-wider">
        {cell.factors.length} factor{cell.factors.length === 1 ? '' : 's'} · click to explain
      </span>
    </button>
  )
}

export default function RiskHeatmapPage() {
  const station = useStationStore((s) => s.station)
  const [cells, setCells] = useState<RiskCell[]>([])
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<RiskCell | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const heatmap = await riskService.getHeatmap(station)
      setCells(heatmap.cells)
      setGeneratedAt(heatmap.generated_at)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load risk heatmap')
    } finally {
      setLoading(false)
    }
  }, [station])

  useEffect(() => { load() }, [load])

  return (
    <div className="h-screen overflow-y-auto bg-brand-bg p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-mono text-sm font-bold text-white uppercase tracking-widest">
              Antarctic Risk Heatmap — {station.toUpperCase()}
            </h1>
            <p className="text-white/40 text-xs mt-1 font-sans">
              Every cell explains itself — click one to see its contributing factors, weights, and evidence.
            </p>
          </div>
          {generatedAt && (
            <span className="font-mono text-[10px] text-white/30 shrink-0">
              Generated {new Date(generatedAt).toLocaleString()}
            </span>
          )}
        </div>

        {loading && <div className="flex justify-center py-16"><InlineLoader text="Computing risk heatmap…" /></div>}
        {error && <div className="py-16"><ErrorState message={error} onRetry={load} /></div>}
        {!loading && !error && cells.length === 0 && (
          <EmptyState message="No risk data available" hint="The backend may not have computed a heatmap for this station yet." />
        )}

        {!loading && !error && cells.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {cells.map((cell) => (
              <RiskCellTile key={cell.subsystem} cell={cell} onClick={() => setSelected(cell)} />
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setSelected(null)}>
          <div
            className="w-full max-w-lg bg-brand-surface border border-brand-border rounded shadow-2xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-brand-border sticky top-0 bg-brand-surface">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} style={{ color: scoreColor(selected.score) }} />
                <h2 className="font-mono text-sm font-semibold text-white uppercase tracking-wider">{selected.label}</h2>
              </div>
              <button onClick={() => setSelected(null)} className="text-white/40 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-white/40 uppercase">Overall Score</span>
                <span className="font-mono text-lg font-bold" style={{ color: scoreColor(selected.score) }}>
                  {Math.round(selected.score)}
                </span>
              </div>
              {selected.factors.length === 0 ? (
                <p className="text-xs font-mono text-white/30 italic">No factor breakdown provided by the backend for this cell.</p>
              ) : (
                selected.factors.map((f) => (
                  <div key={f.name} className="bg-brand-bg border border-brand-border rounded p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-sans font-medium text-white">{f.label}</span>
                      <span className="font-mono text-xs" style={{ color: scoreColor(f.score) }}>{Math.round(f.score)}</span>
                    </div>
                    <div className="h-1 bg-brand-border rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, f.score)}%`, backgroundColor: scoreColor(f.score) }} />
                    </div>
                    <p className="text-[10px] font-mono text-white/40">Weight {(f.weight * 100).toFixed(0)}%</p>
                    <p className="text-[11px] font-sans text-white/60 leading-relaxed">{f.evidence}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
