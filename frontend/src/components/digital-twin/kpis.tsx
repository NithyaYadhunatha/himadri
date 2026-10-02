'use client'

import { Activity, Gauge, Radio, ShieldAlert, Thermometer, Wifi } from 'lucide-react'
import type { ReactNode } from 'react'
import { ASSETS, STATUS_COLOR } from '@/lib/twin/config'
import { effectiveStatus, getHistory, useTwin } from '@/lib/twin/store'
import type { Health } from '@/lib/twin/types'
import { Ring } from './primitives'
import { useNow } from './now'

const SCORE: Record<Health, number> = { normal: 100, warning: 60, critical: 20, offline: 0 }

export function useKpis() {
  const latest = useTwin((s) => s.latest)
  const alerts = useTwin((s) => s.alerts)
  const lastDataAt = useTwin((s) => s.lastDataAt)
  const link = useTwin((s) => s.link)
  const now = useNow()
  const hw = ASSETS.filter((a) => a.hardware)
  const st = hw.map((a) => effectiveStatus(latest[a.id], now))
  const online = st.filter((s) => s !== 'offline').length
  const health = hw.length ? st.reduce((n, s) => n + SCORE[s], 0) / hw.length : 0
  const t = latest['sensor-dht-01']
  const buf = getHistory('sensor-dht-01')
  let trend: string | null = null
  if (buf.length > 2) {
    const first = buf[Math.max(0, buf.length - 150)]
    const last = buf[buf.length - 1]
    if (last.t - first.t >= 60_000) trend = `${last.v - first.v >= 0 ? '↑' : '↓'} ${Math.abs(last.v - first.v).toFixed(1)} °C / ${Math.round((last.t - first.t) / 60000)}m`
  }
  return {
    health, online, total: hw.length,
    freshnessS: lastDataAt ? (now - lastDataAt) / 1000 : null,
    active: alerts.filter((a) => !a.acknowledged).length,
    temp: t && effectiveStatus(t, now) !== 'offline' ? t : null,
    tempStatus: effectiveStatus(t, now),
    trend, link,
  }
}

function Card({ tone = '', icon, title, value, unit, sub, score, color, extra }: {
  tone?: string; icon: ReactNode; title: string; value: string; unit?: string; sub: string; score?: number; color?: string; extra?: string | null
}) {
  return (
    <div className={`tw-kpi ${tone}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94A3B8' }}>
        {icon}<span className="tw-k" style={{ flex: 1 }}>{title}</span>
        {score !== undefined && <Ring value={score} color={color ?? '#84CC16'} />}
      </div>
      <div className="tw-big" style={{ marginTop: 4 }}>{value}{unit && <small>{unit}</small>}</div>
      <div className="tw-sub">{sub}</div>
      {extra && <div className="tw-sub tw-mono" style={{ color: '#BEF264', marginTop: 2 }}>{extra}</div>}
    </div>
  )
}

export function KPIGrid() {
  const k = useKpis()
  const mode = useTwin((s) => s.mode)
  const tone = (h: number) => (h >= 85 ? '' : h >= 50 ? 'c-warn' : 'c-crit')
  const col = (h: number) => (h >= 85 ? STATUS_COLOR.normal : h >= 50 ? STATUS_COLOR.warning : STATUS_COLOR.critical)
  return (
    <div className="tw-grid2">
      <Card tone={tone(k.health)} icon={<Activity size={12} />} title="System health" value={k.health.toFixed(0)} unit="%" sub="Mean of device states" score={k.health} color={col(k.health)} />
      <Card tone="c-info" icon={<Radio size={12} />} title="Sensor availability" value={`${k.online} / ${k.total}`} sub="Devices reporting" />
      <Card tone="c-purple" icon={<Gauge size={12} />} title="Data freshness" value={k.freshnessS === null ? '—' : k.freshnessS.toFixed(1)} unit={k.freshnessS === null ? '' : 's'} sub="Since last reading" />
      <Card tone={k.active ? 'c-warn' : ''} icon={<ShieldAlert size={12} />} title="Active alerts" value={String(k.active)} sub="Unacknowledged" />
      <Card tone={k.tempStatus === 'normal' ? '' : 'c-warn'} icon={<Thermometer size={12} />} title="Temperature" value={k.temp ? k.temp.value.toFixed(1) : '—'} unit={k.temp ? '°C' : ''} sub={k.temp ? `Backend status: ${k.tempStatus}` : 'No reading'} score={k.temp ? SCORE[k.tempStatus] : undefined} color={col(SCORE[k.tempStatus])} extra={k.trend} />
      <Card tone="c-info" icon={<Wifi size={12} />} title="Communication" value={k.link === 'live' ? 'LIVE' : k.link.replace('-', ' ').toUpperCase()} sub={mode === 'demo' ? 'DEMO data' : 'Backend + gateway link'} />
    </div>
  )
}
