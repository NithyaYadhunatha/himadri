'use client'

// A live dot-matrix of every asset at both stations, grouped by category and
// coloured by status — pulled from the twin graph. Falls back to a calm static
// sample if the visitor is not signed in (the proxy refuses anonymous reads).
import { useEffect, useState } from 'react'
import { ASSET_CATEGORY_ABBREV } from '@/lib/constants'

interface Node {
  asset_id: string
  name: string
  category: string
  status: string
  health_score: number
}

const COLOR: Record<string, string> = {
  ok: '#0F8A6A',
  simulating: '#3A3AB8',
  degraded: '#D4820A',
  fault: '#C23B3B',
  offline: '#B7B09B',
}

function sample(station: string): Node[] {
  const plan: [string, number][] = [['storage', 14], ['instrument', 13], ['vehicle', 11], ['power', 3], ['waste', 2], ['medical', 1], ['heating', 1]]
  return plan.flatMap(([category, n]) =>
    Array.from({ length: n }, (_, i) => ({ asset_id: `${station}-${category}-${i}`, name: `${category} ${i + 1}`, category, status: 'ok', health_score: 100 })),
  )
}

function Station({ id, label, nodes, live }: { id: string; label: string; nodes: Node[]; live: boolean }) {
  const cats = [...new Set(nodes.map((n) => n.category))]
  const ok = nodes.filter((n) => n.status === 'ok' || n.status === 'simulating').length
  return (
    <div className="rounded-2xl border border-brand-border bg-brand-surface p-5 shadow-panel">
      <div className="flex items-baseline justify-between mb-4">
        <p className="font-display text-2xl text-white">{label}</p>
        <p className="font-mono text-[10.5px] text-white/50 num">
          <span className="text-emerald font-semibold">{ok}</span> / {nodes.length} reporting {live ? '' : '· sample'}
        </p>
      </div>
      <div className="flex gap-3 items-end overflow-x-auto pb-1">
        {cats.map((c) => {
          const col = nodes.filter((n) => n.category === c)
          return (
            <div key={c} className="flex flex-col items-center gap-1">
              <div className="flex flex-col-reverse gap-[5px]">
                {col.map((n, i) => (
                  <span
                    key={n.asset_id}
                    title={`${n.name} · ${n.status}`}
                    className="w-3 h-3 rounded-full block transition-transform hover:scale-150"
                    style={{ background: COLOR[n.status] ?? COLOR.offline, animation: `rise .5s ${(i * 25) % 400}ms both` }}
                  />
                ))}
              </div>
              <span className="font-mono text-[8.5px] uppercase tracking-wider text-white/40 mt-1">{ASSET_CATEGORY_ABBREV[c] ?? c.slice(0, 3)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function Constellation() {
  const [data, setData] = useState<Record<string, Node[]> | null>(null)
  const [live, setLive] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all(
      ['maitri', 'bharati'].map((s) =>
        fetch(`/api/backend/stations/${s}/twin-graph`)
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((j) => [s, j.nodes as Node[]] as const),
      ),
    )
      .then((pairs) => {
        if (!alive) return
        setData(Object.fromEntries(pairs))
        setLive(true)
      })
      .catch(() => alive && setData({ maitri: sample('maitri'), bharati: sample('bharati').slice(0, 18) }))
    return () => {
      alive = false
    }
  }, [])

  const d = data ?? { maitri: sample('maitri'), bharati: sample('bharati').slice(0, 18) }
  return (
    <div className="grid md:grid-cols-[1.6fr_1fr] gap-4">
      <Station id="maitri" label="Maitri" nodes={d.maitri} live={live} />
      <Station id="bharati" label="Bharati" nodes={d.bharati} live={live} />
    </div>
  )
}
