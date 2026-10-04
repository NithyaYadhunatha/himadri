'use client'

import { Check, X } from 'lucide-react'
import { ASSET_BY_ID, roomOf } from '@/lib/twin/config'
import { useTwin } from '@/lib/twin/store'
import { digitalTwinBridge } from '@/lib/twin/bridge'
import { PanelHead } from './primitives'
import { ago, useNow } from './now'

/** Alerts are derived client-side from backend status transitions. Acknowledge/dismiss are
 *  client-only: the backend has no alert API for these devices. */
export function AlertsPanel() {
  const alerts = useTwin((s) => s.alerts)
  const select = useTwin((s) => s.select)
  const ack = useTwin((s) => s.ack)
  const dismiss = useTwin((s) => s.dismiss)
  const now = useNow()

  function open(assetId: string) {
    select(assetId)
    digitalTwinBridge.focusAsset(assetId)
  }

  return (
    <div className="tw-panel grow">
      <PanelHead title="Alerts">
        <button className="tw-btn" disabled={!alerts.length} onClick={() => alerts.forEach((a) => ack(a.id))}>Ack all</button>
      </PanelHead>
      <div className="tw-body tw-scroll" style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
        {!alerts.length && <div className="tw-sub" style={{ textAlign: 'center', padding: 18 }}>No alerts this session.</div>}
        {alerts.map((a) => (
          <div key={a.id} className={`tw-alert ${a.level} ${a.acknowledged ? 'acked' : ''}`}>
            <div className="bar" />
            <button style={{ all: 'unset', cursor: 'pointer', minWidth: 0 }} onClick={() => open(a.assetId)}>
              <div className="tw-k" style={{ color: a.level === 'critical' ? '#C23B3B' : a.level === 'warning' ? '#A86405' : '#7DD3FC' }}>{a.level}{a.demo ? ' · demo' : ''}</div>
              <div style={{ fontWeight: 600 }}>{a.title}</div>
              <div className="tw-sub">{roomOf(ASSET_BY_ID[a.assetId]?.roomId ?? '')?.name} · {ago(now - a.at)}</div>
            </button>
            <div style={{ display: 'flex', gap: 3, alignItems: 'start' }}>
              <button className="tw-btn" style={{ padding: '0 6px' }} title="Acknowledge" aria-label="Acknowledge" disabled={a.acknowledged} onClick={() => ack(a.id)}><Check size={12} /></button>
              <button className="tw-btn" style={{ padding: '0 6px' }} title="Dismiss" aria-label="Dismiss" onClick={() => dismiss(a.id)}><X size={12} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
