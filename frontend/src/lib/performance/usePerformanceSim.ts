/* eslint-disable react-hooks/refs -- mutable ring buffers are read each render on purpose; `tick` state drives re-renders */
// src/lib/performance/usePerformanceSim.ts
//
// Runs the per-asset performance simulator (assetPerformance.ts) once a second
// for as long as the Remote Control page is mounted, keeps a rolling history
// per asset, and turns every newly APPLIED command into an "impact" record:
// metrics averaged before the command vs. ~30 s after, for the commanded asset
// and for any other asset on the station that moved as a side-effect.
'use client'

import { useEffect, useRef, useState } from 'react'
import type { RemoteAsset, CommandRecord } from '@/services/commands.service'
import {
  buildContext, targetsFor, stepAsset, isOn, mean, metricsFor, HISTORY, predictChanges,
  type Sample, type ImpactEvent, type ImpactRow, type StationContext,
} from './assetPerformance'

const SETTLE_MS = 30_000
const PREFILL = 60

export function usePerformanceSim(assets: RemoteAsset[], commands: CommandRecord[]) {
  const assetsRef = useRef<RemoteAsset[]>(assets)
  const hist = useRef(new Map<string, Sample[]>())
  const vals = useRef(new Map<string, Record<string, number>>())
  const baseline = useRef(new Map<string, number>())
  const seen = useRef<Set<string> | null>(null)
  const impacts = useRef<ImpactEvent[]>([])
  const ctxRef = useRef<StationContext | null>(null)
  const [tick, setTick] = useState(0)

  assetsRef.current = assets

  // remember each asset's nominal reading the first time it is seen running
  useEffect(() => {
    for (const a of assets) {
      if (isOn(a) && (a.primaryValue ?? 0) > 0 && !baseline.current.has(a.id)) baseline.current.set(a.id, a.primaryValue as number)
    }
  }, [assets])

  const recordImpact = (cmd: CommandRecord) => {
    const list = assetsRef.current
    const target = list.find((a) => a.id === cmd.asset_id)
    if (!target) return
    const t0 = cmd.applied_at ? Date.parse(cmd.applied_at) : Date.now()
    const snap: Record<string, Record<string, number>> = {}
    for (const a of list) {
      const win = (hist.current.get(a.id) ?? []).filter((s) => s.t >= t0 - 15_000 && s.t <= t0 - 3_000)
      const fallback = (hist.current.get(a.id) ?? []).slice(-10)
      const use = win.length >= 3 ? win : fallback
      snap[a.id] = Object.fromEntries(metricsFor(a.category).map((m) => [m.key, mean(use, m.key)]))
    }
    const payload = Object.keys(cmd.payload).length ? ` → ${Object.values(cmd.payload).join(', ')}` : ''
    impacts.current = [{
      id: cmd.id, assetId: cmd.asset_id, assetName: target.name, action: cmd.action,
      detail: `${cmd.action}${payload}`, t0, settled: false, rows: [], snap,
    }, ...impacts.current].slice(0, 30)
  }

  // detect newly applied commands (the very first batch is just history, not news)
  useEffect(() => {
    if (!assets.length) return
    const applied = commands.filter((c) => c.state === 'applied')
    if (seen.current === null) {
      seen.current = new Set(applied.map((c) => c.id))
      return
    }
    for (const c of applied) {
      if (!seen.current.has(c.id)) {
        seen.current.add(c.id)
        recordImpact(c)
      }
    }
  }, [commands, assets])

  useEffect(() => {
    const step = (now: number, backfillTo?: number) => {
      const list = assetsRef.current
      if (!list.length) return
      const ctx = buildContext(list, baseline.current)
      ctxRef.current = ctx
      for (const a of list) {
        const base = baseline.current.get(a.id) ?? Math.abs(a.primaryValue ?? 1)
        const targets = targetsFor(a, ctx, base)
        if (!vals.current.has(a.id)) {
          // first sighting: seed the chart with a steady-state minute so it isn't empty
          let v = { ...targets }
          const h: Sample[] = []
          for (let i = PREFILL; i > 0; i--) {
            v = stepAsset(v, targets)
            h.push({ t: now - i * 1000, ...v })
          }
          vals.current.set(a.id, v)
          hist.current.set(a.id, h)
        }
        const next = stepAsset(vals.current.get(a.id) as Record<string, number>, targets)
        vals.current.set(a.id, next)
        const h = hist.current.get(a.id) as Sample[]
        h.push({ t: now, ...next })
        if (h.length > HISTORY) h.splice(0, h.length - HISTORY)
      }
      void backfillTo
    }

    const settle = (now: number) => {
      for (const ev of impacts.current) {
        if (ev.settled || now - ev.t0 < SETTLE_MS) continue
        const rows: ImpactRow[] = []
        for (const a of assetsRef.current) {
          const defs = metricsFor(a.category)
          const recent = (hist.current.get(a.id) ?? []).slice(-8)
          const primary = a.id === ev.assetId
          for (const m of primary ? defs : defs.slice(0, 1)) {
            const before = ev.snap[a.id]?.[m.key] ?? 0
            const after = mean(recent, m.key)
            const moved = Math.abs(after - before) / Math.max(1, Math.abs(before), Math.abs(after))
            if (!primary && moved < 0.06) continue
            rows.push({
              assetId: a.id, assetName: a.name, metricKey: m.key, label: m.label, unit: m.unit,
              before, after, decimals: m.decimals ?? 1, goodWhen: m.goodWhen, primary,
            })
          }
        }
        ev.rows = rows
        ev.settled = true
      }
    }

    step(Date.now())
    setTick((n) => n + 1)
    const id = setInterval(() => {
      const now = Date.now()
      step(now)
      settle(now)
      setTick((n) => n + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const predict = (asset: RemoteAsset, action: string, payload: Record<string, unknown>) =>
    predictChanges(assetsRef.current, asset, action, payload, baseline.current)

  return { history: hist.current, impacts: impacts.current, ctx: ctxRef.current, tick, predict }
}
