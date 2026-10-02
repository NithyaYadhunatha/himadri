'use client'

import { memo } from 'react'
import { ASSETS, ASSET_BY_ID, ROOMS } from '@/lib/twin/config'
import { formatValue } from '@/lib/twin/adapter'
import { effectiveStatus, useTwin } from '@/lib/twin/store'
import { Dot, PanelHead } from './primitives'
import { ago, useNow } from './now'

export const TelemetryCard = memo(function TelemetryCard({ assetId }: { assetId: string }) {
  const r = useTwin((s) => s.latest[assetId])
  const selected = useTwin((s) => s.selectedId === assetId)
  const select = useTwin((s) => s.select)
  const now = useNow()
  const a = ASSET_BY_ID[assetId]
  const st = effectiveStatus(r, now)
  const stale = !!r && st === 'offline' && r.status !== 'offline'
  const label = st === 'offline' ? (stale ? 'STALE' : 'NO DATA') : a.boolean ? '' : st.toUpperCase()
  return (
    <button className={`tw-card ${selected ? 'sel' : ''}`} onClick={() => select(assetId)} aria-pressed={selected}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Dot s={st} /><span className="tw-k" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
      </div>
      <div className="tw-big" style={{ marginTop: 4, opacity: st === 'offline' ? 0.45 : 1 }}>
        {st === 'offline' ? '—' : formatValue(r, assetId)}
        {st !== 'offline' && !a.boolean && <small>{a.unit}</small>}
      </div>
      <div className="tw-sub">{label}{label && r ? ' · ' : ''}{r && st !== 'offline' ? ago(now - r.receivedAt) : ''}</div>
    </button>
  )
})

export function TelemetryPanel() {
  return (
    <div className="tw-panel grow">
      <PanelHead title="Live telemetry" />
      <div className="tw-body tw-scroll">
        {ROOMS.map((room) => (
          <section key={room.id} style={{ marginBottom: 12 }}>
            <div className="tw-k" style={{ marginBottom: 6 }}>{room.short} · {room.name}</div>
            <div className="tw-grid2">
              {ASSETS.filter((a) => a.roomId === room.id && a.hardware).map((a) => <TelemetryCard key={a.id} assetId={a.id} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
