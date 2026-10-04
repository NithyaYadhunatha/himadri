'use client'

import { GitBranch, Home, Keyboard, LocateFixed, Maximize2, Minimize2, RotateCcw } from 'lucide-react'
import { useChromeStore } from '@/store/useChromeStore'
import { useEffect, useState } from 'react'
import { STATION_LABELS } from '@/lib/constants'
import { ASSETS, MAITRI_ROOMS, ROOMS } from '@/lib/twin/config'
import { digitalTwinBridge, type BridgeEvent, type SystemFlowFilter } from '@/lib/twin/bridge'
import { useEquipment } from '@/lib/twin/equipment/store'
import { useHud } from '@/lib/twin/hud'
import { startRealtime, stopRealtime } from '@/lib/twin/realtime'
import { effectiveStatus, roomStatus, useTwin } from '@/lib/twin/store'
import { useStationStore } from '@/store/useStationStore'
import { AlertsPanel } from './AlertsPanel'
import { BharatiConfigurator } from './BharatiConfigurator'
import { ControlsHelp } from './ControlsHelp'
import { EquipmentDetailsPanel } from './EquipmentDetailsPanel'
import { EquipmentSync } from './EquipmentSync'
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
  const station = useStationStore((s) => s.station)
  const latest = useTwin((s) => s.latest)
  const selectedId = useTwin((s) => s.selectedId)
  const now = useNow()
  useEffect(() => {
    if (station !== 'maitri') return
    for (const a of ASSETS) if (a.hardware) digitalTwinBridge.highlightAsset(a.id, a.id === selectedId ? 'selected' : effectiveStatus(latest[a.id], now))
    for (const r of ROOMS) digitalTwinBridge.setRoomState(r.id, roomStatus(latest, r.id, now))
  }, [station, latest, selectedId, now])
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

/** Hides the app header/status strip (and asks the browser for real fullscreen) so only the scene, side panel and controls remain. */
function FullscreenButton() {
  const hidden = useChromeStore((s) => s.hidden)
  const setHidden = useChromeStore((s) => s.setHidden)

  const toggle = (on: boolean) => {
    setHidden(on)
    try {
      if (on && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {})
      else if (!on && document.fullscreenElement) void document.exitFullscreen?.().catch(() => {})
    } catch { /* browser fullscreen is best-effort; hiding the chrome already works */ }
  }

  useEffect(() => {
    // leaving the page, or leaving browser fullscreen with Esc, restores the chrome
    const onFs = () => { if (!document.fullscreenElement) useChromeStore.getState().setHidden(false) }
    document.addEventListener('fullscreenchange', onFs)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && useChromeStore.getState().hidden) useChromeStore.getState().setHidden(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      window.removeEventListener('keydown', onKey)
      useChromeStore.getState().setHidden(false)
    }
  }, [])

  return (
    <button className="tw-hint tw-fs-btn" onClick={() => toggle(!hidden)} aria-pressed={hidden} aria-label={hidden ? 'Exit fullscreen' : 'Enter fullscreen'}>
      {hidden ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
      {hidden ? 'Exit fullscreen' : 'Fullscreen'}
    </button>
  )
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
          <FullscreenButton />
          <button className="tw-hint" onClick={() => useHud.getState().toggleHelp()} aria-label="Show controls (H)"><Keyboard size={12} />Press <kbd>H</kbd> for Controls</button>
        </div>
      </div>
      {toast && <div className="tw-toast tw-panel" role="status">{toast}</div>}
    </>
  )
}

function MaitriCameraBar({ caps, flow }: { caps: string[]; flow: FlowState }) {
  const selectedId = useTwin((s) => s.selectedId)
  const select = useTwin((s) => s.select)
  const flowSupported = caps.includes('setSystemFlow')

  // Maitri has no in-scene selection event for the overlay: focus follows the dashboard selection.
  useEffect(() => {
    if (flowSupported && flow.on) digitalTwinBridge.setSystemFlowFocus(selectedId)
  }, [flowSupported, flow.on, selectedId])

  return (
    <div className="tw-panel tw-cam tw-cam-maitri" role="toolbar" aria-label="Maitri room navigation">
      <button className="tw-btn" onClick={() => digitalTwinBridge.resetCamera()}><Home size={11} />Home</button>
      <div className="tw-cam-rooms" aria-label="All Maitri rooms">
        {MAITRI_ROOMS.map((r) => <button key={r.id} className={`tw-btn ${r.monitoredRoomId ? 'monitored' : ''}`} disabled={!!caps.length && !caps.includes('focusRoom')} title={`${r.name}${r.monitoredRoomId ? ' · PolarTwin monitored' : ''}`} onClick={() => digitalTwinBridge.focusRoom(r.id)}>{r.short}</button>)}
      </div>
      <button className="tw-btn" disabled={!selectedId} onClick={() => selectedId && digitalTwinBridge.focusAsset(selectedId)}><LocateFixed size={11} />Selected</button>
      <button className="tw-btn" onClick={() => { select(null); digitalTwinBridge.resetCamera() }}><RotateCcw size={11} />Reset</button>
      {!caps.length && <span className="tw-sub" style={{ alignSelf: 'center', padding: '0 6px' }} title="The loaded Unity build does not include WebBridge; use the in-scene navigation">3D bridge not in this build</span>}
      <span className="tw-cam-divider" aria-hidden="true" />
      <FlowControls caps={caps} flow={flow} station="Maitri" />
    </div>
  )
}

const FLOW_FILTERS: SystemFlowFilter[] = ['all', 'power', 'data', 'control', 'safety']
/** Same colours as the 3D dependency lines (SystemFlowManager.TypeColors in both Unity builds). */
const FLOW_COLORS: Record<Exclude<SystemFlowFilter, 'all'>, string> = {
  power: '#F5802A',
  data: '#33CC78',
  control: '#7385FF',
  safety: '#F54D4D',
}

interface FlowState {
  on: boolean
  setOn: (on: boolean) => void
  filter: SystemFlowFilter
  setFilter: (filter: SystemFlowFilter) => void
}

/** System-flow toggle + dependency filter, shared by both stations' camera bars. */
function FlowControls({ caps, flow, station }: { caps: string[]; flow: FlowState; station: string }) {
  const supported = caps.includes('setSystemFlow')

  useEffect(() => {
    if (!supported) return
    digitalTwinBridge.setSystemFlow(flow.on)
    digitalTwinBridge.setSystemFlowFilter(flow.filter)
  }, [supported, flow.on, flow.filter])

  return (
    <>
      <button
        className={`tw-btn tw-flow-toggle ${flow.on ? 'on' : ''}`}
        disabled={!supported}
        aria-pressed={flow.on}
        title={supported ? 'Show station component dependency paths' : `The loaded ${station} build does not support system flow`}
        onClick={() => flow.setOn(!flow.on)}
      ><GitBranch size={11} />SYSTEM FLOW: {flow.on ? 'ON' : 'OFF'}</button>
      {flow.on && <div className="tw-flow-filters" aria-label="System flow dependency filter">
        {FLOW_FILTERS.map((value) => (
          <button key={value} className={flow.filter === value ? 'active' : ''} aria-pressed={flow.filter === value} onClick={() => flow.setFilter(value)}>
            {value !== 'all' && <span className="tw-flow-swatch" style={{ background: FLOW_COLORS[value] }} aria-hidden="true" />}
            {value.toUpperCase()}
          </button>
        ))}
      </div>}
    </>
  )
}

function BharatiCameraBar({ caps, flow }: { caps: string[]; flow: FlowState }) {
  const selectedId = useEquipment((s) => s.selectedId)
  const select = useEquipment((s) => s.select)

  return (
    <div className="tw-panel tw-cam tw-cam-bharati" role="toolbar" aria-label="Bharati equipment navigation">
      <span className="tw-cam-title">BHARATI SCIENTIFIC EQUIPMENT</span>
      <button className="tw-btn" disabled={!selectedId || !caps.includes('locateEquipment')} onClick={() => selectedId && digitalTwinBridge.locateEquipment(selectedId)}><LocateFixed size={11} />Locate selected</button>
      <button className="tw-btn pri" disabled={!selectedId || !caps.includes('teleportToEquipment')} onClick={() => selectedId && digitalTwinBridge.teleportToEquipment(selectedId)}>Teleport</button>
      <button className="tw-btn" onClick={() => { select(null); digitalTwinBridge.clearEquipmentSelection() }}><RotateCcw size={11} />Clear</button>
      <span className="tw-cam-divider" aria-hidden="true" />
      <FlowControls caps={caps} flow={flow} station="Bharati" />
    </div>
  )
}

export function TwinShell() {
  const station = useStationStore((s) => s.station)
  const panel = useTwin((s) => s.panel)
  const [showCamera, setShowCamera] = useState(true)
  const [systemFlowOn, setSystemFlowOn] = useState(false)
  const [systemFlowFilter, setSystemFlowFilter] = useState<SystemFlowFilter>('all')
  const flow: FlowState = { on: systemFlowOn, setOn: setSystemFlowOn, filter: systemFlowFilter, setFilter: setSystemFlowFilter }
  const [capabilityState, setCapabilityState] = useState<{ station: typeof station; list: string[] }>({ station, list: [] })
  const caps = capabilityState.station === station ? capabilityState.list : []
  useOverlayKeys()

  useEffect(() => {
    startRealtime()
    const off = digitalTwinBridge.on((e: BridgeEvent) => {
      const st = useTwin.getState()
      if (e.type === 'assetSelected') st.select(e.assetId)
      else if (e.type === 'roomSelected') st.selectRoom(e.roomId)
      else if (e.type === 'capabilities') setCapabilityState({ station: useStationStore.getState().station, list: e.list })
    })
    return () => { off(); stopRealtime() }
  }, [])

  return (
    <NowProvider>
      <div className="tw-root">
        <TwinViewport key={station} station={station} />
        <SceneSync />
        {station === 'bharati' && <EquipmentSync />}
        <TopBar />
        <TwinToolbar showCamera={showCamera} onCamera={() => setShowCamera(!showCamera)} />
        {showCamera && (station === 'maitri'
          ? <MaitriCameraBar caps={caps} flow={flow} />
          : <BharatiCameraBar caps={caps} flow={flow} />)}
        <aside className="tw-right" aria-label="Digital twin panels">
          {station === 'bharati' && <EquipmentDetailsPanel caps={caps} />}
          {station === 'maitri' ? <TwinConfigurator /> : <BharatiConfigurator caps={caps} />}
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
