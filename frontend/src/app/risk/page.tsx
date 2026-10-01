'use client'

// Risk heatmap — a real matrix: one row per subsystem, one column per risk
// factor, each cell shaded by its score. Click any cell for the evidence the
// backend attached to it. The right-hand column is the weighted total.
import { useMemo, useState } from 'react'
import { useStationStore } from '@/store/useStationStore'
import { STATION_LABELS } from '@/lib/constants'
import { useBackend } from '@/lib/hooks/usePoll'
import { Panel, PageHead, Pill, Skeleton, TONE_HEX, type Tone } from '@/components/ui/kit'
import { ago } from '@/lib/format'

interface Factor {
  name: string
  label: string
  score: number
  weight: number
  evidence: string
}
interface Row {
  id: string
  subsystem: string
  score: number
  factors: Factor[]
  computed_at: string
}

const tone = (n: number): Tone => (n >= 66 ? 'crit' : n >= 40 ? 'warn' : 'ok')
const cellBg = (n: number) => {
  const c = n >= 66 ? '194,59,59' : n >= 40 ? '212,130,10' : '15,138,106'
  return `rgba(${c},${(0.08 + (Math.min(100, n) / 100) * 0.5).toFixed(2)})`
}

export default function RiskHeatmapPage() {
  const station = useStationStore((s) => s.station)
  const risk = useBackend<Row[]>(`analytics/risk?station=${station}`, 30000)
  const [sel, setSel] = useState<{ row: Row; factor: Factor } | null>(null)

  const rows = useMemo(() => [...(risk.data ?? [])].sort((a, b) => b.score - a.score), [risk.data])
  const cols = useMemo(() => {
    const m = new Map<string, { label: string; weight: number }>()
    for (const r of rows) for (const f of r.factors) if (!m.has(f.name)) m.set(f.name, { label: f.label, weight: f.weight })
    return [...m.entries()]
  }, [rows])

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1300px] mx-auto px-6 py-7">
        <PageHead
          eyebrow={`Risk heatmap · ${STATION_LABELS[station]}`}
          title="Where the station is exposed — and why."
          sub="Every subsystem is scored from weighted factors. Nothing here is a black box: click a cell to read the evidence behind it."
          right={rows[0] && <Pill tone="mute">computed {ago(rows[0].computed_at)}</Pill>}
        />

        <Panel pad={false}>
          {risk.loading && !risk.data ? (
            <div className="p-5"><Skeleton className="h-72" /></div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-white/55">No risk cells computed for this station yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-[3px] p-3 min-w-[900px]">
                <thead>
                  <tr>
                    <th className="text-left px-3 pb-2 eyebrow w-36">Subsystem</th>
                    {cols.map(([k, c]) => (
                      <th key={k} className="px-2 pb-2 text-left align-bottom">
                        <p className="eyebrow leading-snug">{c.label}</p>
                        <p className="font-mono text-[9.5px] text-white/35">weight {(c.weight * 100).toFixed(0)}%</p>
                      </th>
                    ))}
                    <th className="px-3 pb-2 eyebrow text-right w-28">Weighted score</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 font-mono text-[12px] uppercase tracking-wider text-white">{r.subsystem}</td>
                      {cols.map(([k]) => {
                        const f = r.factors.find((x) => x.name === k)
                        const active = sel?.row.id === r.id && sel.factor.name === k
                        return (
                          <td key={k} className="p-0">
                            {f ? (
                              <button
                                onClick={() => setSel({ row: r, factor: f })}
                                className={`w-full h-14 rounded-lg font-display text-[22px] num text-white transition hover:scale-[1.04] ${active ? 'ring-2 ring-white' : ''}`}
                                style={{ background: cellBg(f.score) }}
                              >
                                {f.score.toFixed(0)}
                              </button>
                            ) : (
                              <div className="h-14 rounded-lg bg-brand-surface-2" />
                            )}
                          </td>
                        )
                      })}
                      <td className="px-3 text-right">
                        <span className="font-display text-[30px] num" style={{ color: TONE_HEX[tone(r.score)] }}>{r.score.toFixed(0)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="grid lg:grid-cols-[1.2fr_1fr] gap-5 mt-5">
          <Panel eyebrow="Evidence" title={sel ? `${sel.row.subsystem} · ${sel.factor.label}` : 'Select a cell'}>
            {sel ? (
              <div>
                <div className="flex items-baseline gap-3">
                  <span className="font-display text-5xl num" style={{ color: TONE_HEX[tone(sel.factor.score)] }}>{sel.factor.score.toFixed(0)}</span>
                  <span className="font-mono text-[11px] text-white/50">× weight {(sel.factor.weight * 100).toFixed(0)}% = <b className="text-white">{(sel.factor.score * sel.factor.weight).toFixed(1)}</b> points of {sel.row.score.toFixed(0)}</span>
                </div>
                <p className="text-[14px] text-white/80 leading-relaxed mt-4 rounded-xl bg-brand-surface-2/70 border border-brand-border p-4">{sel.factor.evidence}</p>
              </div>
            ) : (
              <p className="text-[13px] text-white/55 leading-relaxed">Each cell is one factor of one subsystem&rsquo;s risk. The text the backend recorded for that cell appears here — the data it looked at, not a conclusion.</p>
            )}
          </Panel>
          <Panel eyebrow="Reading the map" title="Scale">
            <div className="flex items-center gap-1 h-10 rounded-lg overflow-hidden">
              {[5, 20, 35, 50, 65, 80, 95].map((n) => (
                <div key={n} className="flex-1 h-full flex items-center justify-center font-mono text-[10px] text-white/70" style={{ background: cellBg(n) }}>{n}</div>
              ))}
            </div>
            <ul className="mt-4 space-y-2 text-[13px] text-white/70">
              <li><b className="text-emerald">0–39</b> managed — monitor</li>
              <li><b className="text-amber">40–65</b> elevated — plan mitigation</li>
              <li><b className="text-crimson">66+</b> high — act before the next isolation window</li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  )
}
