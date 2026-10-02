'use client'

import { ASSETS, assetsInRoom, ROOMS } from '@/lib/twin/config'
import { STATION_LABELS } from '@/lib/constants'
import { STATION_HAS_RIG } from '@/lib/twin/config'
import { formatValue } from '@/lib/twin/adapter'
import { effectiveStatus, roomStatus, useTwin } from '@/lib/twin/store'
import { useStationStore } from '@/store/useStationStore'
import { GatewayCard } from './GatewayCard'
import { KPIGrid, useKpis } from './kpis'
import { PanelHead, StatusPill } from './primitives'
import { SystemFlow } from './SystemFlow'
import { useNow } from './now'

export function StationOverview() {
  const station = useStationStore((s) => s.station)
  const latest = useTwin((s) => s.latest)
  const link = useTwin((s) => s.link)
  const mode = useTwin((s) => s.mode)
  const k = useKpis()
  const now = useNow()
  const rig = STATION_HAS_RIG[station]
  const env = ['sensor-dht-01', 'sensor-humidity-01', 'sensor-mq2-01']

  return (
    <div className="grow tw-scroll" style={{ overflow: 'auto', display: 'grid', gap: 8, alignContent: 'start' }}>
      <div className="tw-panel">
        <PanelHead title="Station" />
        <div className="tw-body">
          <dl className="tw-kv">
            <dt>Station</dt><dd>{STATION_LABELS[station]}</dd>
            <dt>Location</dt><dd>Antarctica</dd>
            <dt>Mode</dt><dd>Research station digital twin</dd>
            <dt>Gateway</dt><dd>Raspberry Pi</dd>
            <dt>Controller</dt><dd>Arduino Uno</dd>
            <dt>Telemetry</dt><dd>{rig ? 'Physical rig → backend' : 'No live rig for this station'}</dd>
          </dl>
          {!rig && mode === 'live' && <div className="tw-banner info" style={{ marginTop: 8 }}>The sensor rig reports for Maitri only. Use DEMO mode to rehearse this view.</div>}
        </div>
      </div>
      <div className="tw-panel">
        <PanelHead title="Environment" />
        <div className="tw-body">
          <div className="tw-grid2" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
            {env.map((id) => {
              const a = ASSETS.find((x) => x.id === id)!
              const st = effectiveStatus(latest[id], now)
              return <div key={id} className="tw-card"><div className="tw-k">{a.type}</div><div className="tw-big" style={{ fontSize: 16, opacity: st === 'offline' ? 0.4 : 1 }}>{st === 'offline' ? '—' : formatValue(latest[id], id)}<small>{st === 'offline' ? '' : a.unit}</small></div></div>
            })}
          </div>
          <div className="tw-k" style={{ margin: '10px 0 4px' }}>Rooms</div>
          {ROOMS.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
              <span style={{ flex: 1 }}>{r.short} · {r.name}</span>
              <span className="tw-sub">{assetsInRoom(r.id).filter((a) => a.hardware).length} devices</span>
              <StatusPill s={roomStatus(latest, r.id, now)} />
            </div>
          ))}
        </div>
      </div>
      <div className="tw-panel">
        <PanelHead title="System KPIs"><span className="tw-sub">{link}</span></PanelHead>
        <div className="tw-body"><KPIGrid /><div className="tw-sub" style={{ marginTop: 6 }}>{k.online}/{k.total} devices reporting. Health is a derived score, not a measured quantity.</div></div>
      </div>
      <GatewayCard />
      <SystemFlow />
    </div>
  )
}
