'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { ASSET_BY_ID, assetsInRoom, ROOMS, roomOf } from '@/lib/twin/config'
import { digitalTwinBridge } from '@/lib/twin/bridge'
import { STATION_LABELS, STATIONS } from '@/lib/constants'
import { effectiveStatus, useTwin } from '@/lib/twin/store'
import { useStationStore } from '@/store/useStationStore'
import { Dot, Field, LINK_META, PanelHead, StatusPill, Tabs } from './primitives'
import { useNow } from './now'

type Tab = 'station' | 'room' | 'asset' | 'power'

export function TwinConfigurator() {
  const [tab, setTab] = useState<Tab>('asset')
  const [open, setOpen] = useState(true)
  const station = useStationStore((s) => s.station)
  const canSwitch = useStationStore((s) => s.canSwitch)
  const setStation = useStationStore((s) => s.setStation)
  const mode = useTwin((s) => s.mode)
  const setMode = useTwin((s) => s.setMode)
  const link = useTwin((s) => s.link)
  const latest = useTwin((s) => s.latest)
  const roomId = useTwin((s) => s.roomId) ?? ROOMS[0].id
  const selectedId = useTwin((s) => s.selectedId)
  const select = useTwin((s) => s.select)
  const selectRoom = useTwin((s) => s.selectRoom)
  const now = useNow()
  const roomAssets = assetsInRoom(roomId).filter((a) => a.hardware)
  const asset = selectedId ? ASSET_BY_ID[selectedId] : null
  const st = effectiveStatus(selectedId ? latest[selectedId] : undefined, now)

  function pickRoom(id: string) {
    selectRoom(id)
    digitalTwinBridge.focusRoom(id)
    if (asset && asset.roomId !== id) select(null)
  }
  function pickAsset(id: string) {
    select(id || null)
    if (id) digitalTwinBridge.focusAsset(id)
  }

  return (
    <div className="tw-panel">
      <PanelHead title="PolarTwin configurator">
        <StatusPill s={mode === 'demo' ? 'normal' : LINK_META[link].tone} label={mode === 'demo' ? 'DEMO' : LINK_META[link].label} />
        <button className="tw-ib" style={{ width: 24, height: 24 }} aria-label={open ? 'Collapse configurator' : 'Expand configurator'} onClick={() => setOpen(!open)}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </PanelHead>
      {open && (
        <>
          <Tabs<Tab> value={tab} onChange={setTab} items={[{ id: 'station', label: 'STATION' }, { id: 'room', label: 'ROOM' }, { id: 'asset', label: 'ASSET' }, { id: 'power', label: 'POWER' }]} />
          <div className="tw-body">
            {tab === 'station' && (
              <>
                <Field label="Station">
                  <select className="tw-sel" value={station} disabled={!canSwitch} onChange={(e) => setStation(e.target.value as typeof station)}>
                    {STATIONS.map((s) => <option key={s} value={s}>{STATION_LABELS[s]}</option>)}
                  </select>
                </Field>
                <Field label="Mode">
                  <div style={{ display: 'flex', gap: 5 }}>
                    <button className={`tw-btn ${mode === 'live' ? 'on' : ''}`} onClick={() => mode !== 'live' && setMode('live')}>LIVE</button>
                    <button className={`tw-btn ${mode === 'demo' ? 'on' : ''}`} onClick={() => mode !== 'demo' && setMode('demo')}>DEMO</button>
                  </div>
                </Field>
              </>
            )}
            {(tab === 'room' || tab === 'asset') && (
              <Field label="Room">
                <select className="tw-sel" value={roomId} onChange={(e) => pickRoom(e.target.value)}>
                  {ROOMS.map((r) => <option key={r.id} value={r.id}>{r.short} — {r.name}</option>)}
                </select>
              </Field>
            )}
            {tab === 'room' && roomAssets.map((a) => (
              <button key={a.id} className="tw-card" style={{ marginBottom: 5, display: 'flex', gap: 8, alignItems: 'center' }} onClick={() => pickAsset(a.id)}>
                <Dot s={effectiveStatus(latest[a.id], now)} /><span style={{ flex: 1 }}>{a.name}</span><span className="tw-sub">{a.role}</span>
              </button>
            ))}
            {tab === 'asset' && (
              <>
                <Field label="Asset">
                  <select className="tw-sel" value={selectedId && asset?.roomId === roomId ? selectedId : ''} onChange={(e) => pickAsset(e.target.value)}>
                    <option value="">Select an asset…</option>
                    {roomAssets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </Field>
                {asset && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="tw-k">Status</span><StatusPill s={st} label={st === 'offline' ? 'OFFLINE' : st === 'normal' ? 'ONLINE' : st.toUpperCase()} />
                    <span className="tw-sub" style={{ marginLeft: 'auto' }}>{roomOf(asset.roomId)?.short}</span>
                  </div>
                )}
              </>
            )}
            {tab === 'power' && (
              <div className="tw-sub">
                No power or load metering exists on the current rig, so there is no power data to show. Actuator state is in Live Telemetry (buzzer, servo).
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
