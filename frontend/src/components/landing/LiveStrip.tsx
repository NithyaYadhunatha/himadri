'use client'

// The landing page's evidence strip: four real numbers from the deployed
// backend, so the first thing a visitor sees is that the engine is running.
import { useBackend } from '@/lib/hooks/usePoll'
import { AnimatedNumber } from '@/components/ui/kit'

export function LiveStrip() {
  const series = useBackend<unknown[]>('series', 120000)
  const chain = useBackend<{ checked: number; valid: boolean }>('audit/verify', 60000)
  const maitri = useBackend<{ total_assets: number; ok_assets: number }>('stations/maitri/summary', 30000)
  const bharati = useBackend<{ total_assets: number; ok_assets: number }>('stations/bharati/summary', 30000)
  const sync = useBackend<{ queue_depth: number }>('sync/status', 30000)

  const assets = (maitri.data?.total_assets ?? 0) + (bharati.data?.total_assets ?? 0)
  const items = [
    { k: 'Assets modelled', v: assets || null, s: 'across 2 stations' },
    { k: 'Telemetry series', v: Array.isArray(series.data) ? series.data.length : null, s: 'streaming now' },
    { k: 'Events chained', v: chain.data?.checked ?? null, s: chain.data ? (chain.data.valid ? 'chain verified' : 'CHAIN BROKEN') : 'verifying' },
    { k: 'Queued for HQ', v: sync.data?.queue_depth ?? null, s: 'store-and-forward' },
  ]
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 rounded-2xl border border-brand-border bg-brand-surface shadow-panel overflow-hidden">
      {items.map((i, idx) => (
        <div key={i.k} className={`px-6 py-5 ${idx > 0 ? 'md:border-l' : ''} ${idx % 2 === 1 ? 'border-l md:border-l' : ''} ${idx > 1 ? 'border-t md:border-t-0' : ''} border-brand-border`}>
          <p className="eyebrow">{i.k}</p>
          <p className="font-display text-[40px] leading-none text-white mt-1.5">
            <AnimatedNumber value={i.v} />
          </p>
          <p className="font-mono text-[10.5px] text-white/45 mt-1.5">{i.s}</p>
        </div>
      ))}
    </div>
  )
}
