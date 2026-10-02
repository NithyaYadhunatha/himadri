'use client'

import { Home, Keyboard, LocateFixed, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { STATION_LABELS } from '@/lib/constants'
import { ASSETS, ROOMS } from '@/lib/twin/config'
import { digitalTwinBridge, type BridgeEvent } from '@/lib/twin/bridge'
import { useHud } from '@/lib/twin/hud'
import { startRealtime, stopRealtime } from '@/lib/twin/realtime'
import { effectiveStatus, roomStatus, useTwin } from '@/lib/twin/store'
import { useStationStore } from '@/store/useStationStore'
import { AlertsPanel } from './AlertsPanel'
import { ControlsHelp } from './ControlsHelp'
import { AnalyticsPanel } from './AnalyticsPanel'
import { LayersPanel } from './LayersPanel'
import { LINK_META, StatusPill } from './primitives'
import { NowProvider, useNow } from './now'
import { SettingsPanel } from './SettingsPanel'
import { SimulationPanel } from './SimulationPanel'
import { StationOverview } from './StationOverview'
import { TelemetryPanel } from './TelemetryPanel'
import { TwinConfigurator } from './TwinConfigurator'
import { TwinToolbar } from './TwinToolbar'
import { TwinViewport } from './TwinViewport'
import './twin.css'

/** Pushes status → 3D (outlines/glows via the bridge; de-duplicated there). Renders nothing. */
function SceneSync() {
  const latest = useTwin((s) => s.latest)
  const selectedId = useTwin((s) => s.selectedId)
  const now = useNow()
  useEffect(() => {
    for (const a of ASSETS) if (a.hardware) digitalTwinBridge.highlightAsset(a.id, a.id === selectedId ? 'selected' : effectiveStatus(latest[a.id], now))
    for (const r of ROOMS) digitalTwinBridge.setRoomState(r.id, roomStatus(latest, r.id, now))
  }, [latest, selectedId, now])
  return null
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)
}

/** The ONE keyboard handler for overlays. Keys arrive from this page or are forwarded by the Unity host page. */
function useOverlayKeys() {
  useEffect(() => {
    const handle = (key: string) => {
      const hud = useHud.getState()
      if (key === 'h' || key === 'H') {
        hud.toggleHelp()
        if (useHud.getState().overlay === 'help') digitalTwinBridge.releasePointer()
      } else if (key === 'Escape') hud.escape()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      handle(e.key)
    }
    window.addEventListener('keydown', onKey)
    const off = digitalTwinBridge.on((e: BridgeEvent) => {
      if (e.type === 'key') handle(e.key)
    })
    return () => { window.removeEventListener('keydown', onKey); off() }
  }, [])
}

function TopBar() {
  const station = useStationStore((s) => s.station)
  const link = useTwin((s) => s.link)
  const mode = useTwin((s) => s.mode)
  const [toast, setToast] = useState<string | null>(null)
  const m = mode === 'demo' ? { label: 'DEMO', tone: 'normal' as const, text: 'Simulated values — no hardware is connected' } : LINK_META[link]

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    const unsub = useTwin.subscribe((st, prev) => {
      if (st.newAlertFlash === prev.newAlertFlash || !st.alerts[0]) return
      setToast(st.alerts[0].title)
      clearTimeout(t)
      t = setTimeout(() => setToast(null), 3500)
    })
    return () => { unsub(); clearTimeout(t) }
  }, [])

  return (
    <>
      <div className="tw-top">
        <div className="tw-brand">
          POLARTWIN <StatusPill s={m.tone} label={m.label} /> <span className="tw-sub" style={{ letterSpacing: 0, fontWeight: 500 }}>{STATION_LABELS[station]}</span>
        </div>
        {mode === 'demo' && <div className="tw-banner demo">DEMO DATA — values are simulated and not from hardware</div>}
        {mode === 'live' && link !== 'live' && link !== 'connecting' && <div className={`tw-banner ${link === 'stale' ? 'warn' : 'crit'}`} role="status">{m.text}</div>}
        <div className="tw-top-actions">
          <button className="tw-hint" onClick={() => useHud.getState().toggleHelp()} aria-label="Show controls (H)"><Keyboard size={12} />Press <kbd>H</kbd> for Controls</button>
        </div>
      </div>
      {toast && <div className="tw-toast tw-panel" role="status">{toast}</div>}
    </>
  )
}

function CameraBar({ caps }: { caps: string[] }) {
  const selectedId = useTwin((s) => s.selectedId)
  const select = useTwin((s) => s.select)
  return (
    <div className="tw-panel tw-cam" role="toolbar" aria-label="Camera">
      <button className="tw-btn" onClick={() => digitalTwinBridge.resetCamera()}><Home size={11} />Home</button>
      {ROOMS.map((r) => <button key={r.id} className="tw-btn" onClick={() => digitalTwinBridge.focusRoom(r.id)}>{r.short}</button>)}
      <button className="tw-btn" disabled={!selectedId} onClick={() => selectedId && digitalTwinBridge.focusAsset(selectedId)}><LocateFixed size={11} />Selected</button>
      <button className="tw-btn" onClick={() => { select(null); digitalTwinBridge.resetCamera() }}><RotateCcw size={11} />Reset</button>
      {!caps.includes('focusRoom') && <span className="tw-sub" style={{ alignSelf: 'center', padding: '0 6px' }} title="The loaded Unity build does not include WebBridge; use the in-scene navigation">3D bridge not in this build</span>}
    </div>
  )
}

export function TwinShell() {
  const station = useStationStore((s) => s.station)
  const panel = useTwin((s) => s.panel)
  const [showCamera, setShowCamera] = useState(true)
  const [caps, setCaps] = useState<string[]>([])
  useOverlayKeys()

  useEffect(() => {
    startRealtime()
    const off = digitalTwinBridge.on((e: BridgeEvent) => {
      const st = useTwin.getState()
      if (e.type === 'assetSelected') st.select(e.assetId)
      else if (e.type === 'roomSelected') st.selectRoom(e.roomId)
      else if (e.type === 'capabilities') setCaps(e.list)
    })
    return () => { off(); stopRealtime() }
  }, [])

  return (
    <NowProvider>
      <div className="tw-root">
        <TwinViewport key={station} station={station} />
        <SceneSync />
        <TopBar />
        <TwinToolbar showCamera={showCamera} onCamera={() => setShowCamera(!showCamera)} />
        {showCamera && <CameraBar caps={caps} />}
        <aside className="tw-right" aria-label="Digital twin panels">
          <TwinConfigurator />
          {panel === 'configure' && <StationOverview />}
          {panel === 'analytics' && <AnalyticsPanel />}
          {panel === 'telemetry' && <TelemetryPanel />}
          {panel === 'alerts' && <AlertsPanel />}
          {panel === 'simulation' && <SimulationPanel />}
          {panel === 'layers' && <LayersPanel />}
          {panel === 'settings' && <SettingsPanel caps={caps} />}
        </aside>
        <ControlsHelp />
      </div>
    </NowProvider>
  )
}
