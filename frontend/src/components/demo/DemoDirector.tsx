'use client'

// Demo Director — a presenter-only control panel (press Shift + D). It talks to
// the local station feeder's control port and switches REAL incidents on and off
// in the live station feed, so the whole stack reacts: alert engine, risk,
// twin, status bar, copilot. Hidden by default; nothing renders unless the
// feeder is reachable, so it never appears in a normal deployment.
import { useCallback, useEffect, useState } from 'react'
import { Clapperboard, X } from 'lucide-react'

const FEEDER = process.env.NEXT_PUBLIC_FEEDER_URL ?? 'http://127.0.0.1:7070'

const INCIDENTS: { id: string; label: string; what: string }[] = [
  { id: 'freezer_warming', label: 'Freezer warming', what: 'Deep Freezer 1 climbs out of its −20…−18 °C band → warning alert, food at risk' },
  { id: 'generator_fault', label: 'Generator fault', what: 'Generator 1 output collapses → power drops, dependants affected, risk rises' },
  { id: 'fuel_leak', label: 'Fuel leak', what: 'Fuel Tank 01 loses ~900 L/h → endurance margin shrinks toward the critical threshold' },
  { id: 'coolant_overheat', label: 'Coolant overheat', what: 'PistenBully 1 coolant runs away → vehicle readiness and convoy gate affected' },
]

interface State {
  incident: string
  cycle: number
  assets: number
}

export function DemoDirector() {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<State | null>(null)
  const [busy, setBusy] = useState(false)

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`${FEEDER}/state`, { cache: 'no-store' })
      if (!r.ok) throw new Error()
      setState(await r.json())
    } catch {
      setState(null)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key.toLowerCase() === 'd' && !/input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? '')) {
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    poll()
    const t = setInterval(poll, 3000)
    return () => clearInterval(t)
  }, [open, poll])

  async function set(name: string) {
    setBusy(true)
    try {
      await fetch(`${FEEDER}/incident`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      await poll()
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null
  return (
    <div className="print:hidden fixed left-6 bottom-6 z-50 w-[360px] rounded-2xl border border-brand-border bg-brand-surface shadow-[0_24px_60px_-20px_rgba(8,3,48,0.45)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-white text-brand-surface">
        <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
          <Clapperboard size={14} className="text-marigold" /> Demo director
        </span>
        <button onClick={() => setOpen(false)} aria-label="Close"><X size={14} /></button>
      </div>
      <div className="p-4">
        {!state ? (
          <p className="font-mono text-[11px] text-white/75 leading-relaxed">
            Station feeder not reachable at <b>{FEEDER}</b>. Start it with <code className="bg-brand-surface-2 px-1.5 py-0.5 rounded">node tools/station-feeder/feeder.mjs</code>.
          </p>
        ) : (
          <>
            <p className="font-mono text-[10.5px] text-white/70 mb-3">
              Feeder live · cycle {state.cycle} · {state.assets} assets · active incident: <b className="text-white">{state.incident || 'none'}</b>
            </p>
            <ul className="space-y-2">
              {INCIDENTS.map((i) => {
                const on = state.incident === i.id
                return (
                  <li key={i.id}>
                    <button
                      disabled={busy}
                      onClick={() => set(on ? '' : i.id)}
                      className={`w-full text-left rounded-xl border px-3.5 py-2.5 transition ${on ? 'border-crimson bg-crimson/10' : 'border-brand-border hover:border-cyan'}`}
                    >
                      <span className="flex items-center justify-between">
                        <span className="text-[13px] text-white font-medium">{i.label}</span>
                        <span className={`font-mono text-[10px] uppercase tracking-wider ${on ? 'text-crimson' : 'text-white/62'}`}>{on ? 'running — click to stop' : 'trigger'}</span>
                      </span>
                      <span className="block font-mono text-[10px] text-white/70 mt-0.5 leading-snug">{i.what}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <button disabled={busy || !state.incident} onClick={() => set('')} className="mt-3 w-full rounded-lg bg-white text-brand-surface py-2 font-mono text-[11px] uppercase tracking-wider disabled:opacity-35">
              Clear all incidents
            </button>
          </>
        )}
        <p className="font-mono text-[10px] text-white/58 mt-3">Shift + D toggles this panel.</p>
      </div>
    </div>
  )
}
