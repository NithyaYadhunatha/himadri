'use client'

import { useState } from 'react'
import { ASSET_BY_ID, roomOf } from '@/lib/twin/config'
import { formatValue } from '@/lib/twin/adapter'
import { effectiveStatus, getHistory, useTwin } from '@/lib/twin/store'
import { AssetControlPanel } from './AssetControlPanel'
import { KPIGrid } from './kpis'
import { PanelHead, StatusPill, Tabs } from './primitives'
import { TelemetryCard } from './TelemetryPanel'
import { TelemetryChart } from './TelemetryChart'
import { ago, useNow } from './now'

type Tab = 'specs' | 'kpis' | 'telemetry' | 'history'

function NoSelection() {
  return <div className="tw-sub" style={{ padding: '18px 4px', textAlign: 'center' }}>No asset selected. Click a device in the 3D scene, a card in Live Telemetry, or pick one in the Configurator.</div>
}

export function AnalyticsPanel() {
  const [tab, setTab] = useState<Tab>('specs')
  const id = useTwin((s) => s.selectedId)
  const r = useTwin((s) => (id ? s.latest[id] : undefined))
  const alerts = useTwin((s) => s.alerts)
  const mode = useTwin((s) => s.mode)
  useTwin((s) => s.tick)
  const now = useNow()
  const a = id ? ASSET_BY_ID[id] : null
  const st = effectiveStatus(r, now)

  return (
    <div className="tw-panel grow">
      <PanelHead title="Analytics">{mode === 'demo' && <span className="tw-pill demo">DEMO</span>}</PanelHead>
      <Tabs<Tab> value={tab} onChange={setTab} items={[
        { id: 'specs', label: 'SPECS' }, { id: 'kpis', label: 'KPIs' }, { id: 'telemetry', label: 'TELEMETRY' }, { id: 'history', label: 'HISTORY' },
      ]} />
      <div className="tw-body tw-scroll" style={{ marginTop: 6 }}>
        {tab === 'kpis' && <KPIGrid />}

        {tab !== 'kpis' && a && id && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{a.name}</div>
                <div className="tw-sub">{roomOf(a.roomId)?.short} · {roomOf(a.roomId)?.name}</div>
              </div>
              <StatusPill s={st} label={st === 'offline' ? 'OFFLINE' : st === 'normal' ? 'ONLINE' : st.toUpperCase()} />
            </div>
          </div>
        )}
        {tab !== 'kpis' && !a && <NoSelection />}

        {tab === 'specs' && a && id && (
          <>
            <div className="tw-card" style={{ marginBottom: 8 }}>
              <div className="tw-k">Latest reading</div>
              <div className="tw-big">{st === 'offline' ? '—' : formatValue(r, id)}{st !== 'offline' && !a.boolean && <small>{a.unit}</small>}</div>
              <div className="tw-sub">{r ? `Updated ${ago(now - r.receivedAt)}` : 'No reading received'}</div>
            </div>
            <dl className="tw-kv" style={{ marginBottom: 8 }}>
              <dt>Device ID</dt><dd className="tw-mono">{a.id}</dd>
              <dt>Type</dt><dd>{a.type}{a.note ? ` · ${a.note}` : ''}</dd>
              <dt>Role</dt><dd style={{ textTransform: 'capitalize' }}>{a.role}</dd>
              <dt>Controller</dt><dd>{a.controller}</dd>
              <dt>Gateway</dt><dd>{a.gateway}</dd>
              <dt>Connection</dt><dd>{a.connection}</dd>
              <dt>Status source</dt><dd>Backend rule engine</dd>
            </dl>
            <AssetControlPanel assetId={id} />
          </>
        )}

        {tab === 'telemetry' && a && id && (
          <>
            <div style={{ marginBottom: 8 }}><TelemetryCard assetId={id} /></div>
            <div className="tw-card"><TelemetryChart assetId={id} /></div>
          </>
        )}

        {tab === 'history' && a && id && (
          <>
            <div className="tw-k" style={{ marginBottom: 4 }}>Alerts for this asset</div>
            {alerts.filter((x) => x.assetId === id).slice(0, 6).map((x) => (
              <div key={x.id} className="tw-sub" style={{ padding: '3px 0' }}>{x.level.toUpperCase()} · {x.title} · {ago(now - x.at)}</div>
            ))}
            {!alerts.some((x) => x.assetId === id) && <div className="tw-sub">None this session.</div>}
            <div className="tw-k" style={{ margin: '10px 0 4px' }}>Recent samples</div>
            <table className="tw-mono" style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse' }}>
              <tbody>
                {getHistory(id).slice(-12).reverse().map((s) => (
                  <tr key={s.t} style={{ borderTop: '1px solid rgba(8,3,48,.1)' }}>
                    <td style={{ padding: '2px 0', color: '#5A5878' }}>{new Date(s.t).toLocaleTimeString()}</td>
                    <td style={{ textAlign: 'right' }}>{a.boolean ? a.stateLabels?.[s.v ? 1 : 0] : `${s.v} ${a.unit}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}
