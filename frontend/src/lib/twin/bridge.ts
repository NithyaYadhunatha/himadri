// The ONLY module that talks to the Unity iframe. UI components call
// digitalTwinBridge.* and never touch the iframe or postMessage directly.
//
// Transport: window.postMessage between the Next.js page and the Unity WebGL
// page (public/unity/**/index.html), which forwards web→3D commands to the
// Unity GameObject `WebBridge` via SendMessage. 3D→web events (asset/room
// clicks) are posted by WebBridge.jslib. Both sides ship in this repo; the C#
// half lives in docs/unity/ because the Unity project is not in this repo.
// Until the Unity build contains WebBridge, `capabilities` stays empty and the
// UI says so instead of pretending the 3D scene reacted.

import type { Health, HeatVariable } from './types'

export type BridgeCommand =
  | { type: 'focusAsset'; assetId: string }
  | { type: 'focusRoom'; roomId: string }
  | { type: 'setAssetHighlight'; assetId: string | null; state: Health | 'selected' }
  | { type: 'setRoomState'; roomId: string; state: Health }
  | { type: 'setHeatmapMode'; on: boolean; variable: HeatVariable; opacity: number }
  | { type: 'setHeatmapValue'; values: Record<string, number> }
  | { type: 'resetCamera' }
  | { type: 'toggleLayer'; layer: string; on: boolean }
  | { type: 'releasePointer' }

export type BridgeEvent =
  | { type: 'assetSelected'; assetId: string }
  | { type: 'roomSelected'; roomId: string }
  | { type: 'sceneLoaded' }
  | { type: 'assetStatusChanged'; assetId: string; state: Health }
  | { type: 'capabilities'; list: string[] }
  | { type: 'key'; key: string }

type Listener = (e: BridgeEvent) => void

class DigitalTwinBridge {
  private frame: HTMLIFrameElement | null = null
  private listeners = new Set<Listener>()
  private origin = ''
  private lastRoomState = new Map<string, Health>()
  private lastHighlight = new Map<string, string>()
  capabilities: string[] = []
  sceneLoaded = false

  attach(frame: HTMLIFrameElement | null) {
    this.frame = frame
    this.capabilities = []
    this.sceneLoaded = false
    this.lastRoomState.clear()
    this.lastHighlight.clear()
    if (frame && typeof window !== 'undefined') this.origin = window.location.origin
  }

  /** Subscribe to 3D → web events. Returns an unsubscribe fn. */
  on(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  /** Called by the single window message listener installed in TwinViewport. */
  handleMessage(ev: MessageEvent) {
    if (!this.frame || ev.source !== this.frame.contentWindow || ev.origin !== this.origin) return
    const d = ev.data as { source?: string; event?: BridgeEvent }
    if (d?.source !== 'polartwin-unity' || !d.event) return
    if (d.event.type === 'capabilities') this.capabilities = d.event.list
    if (d.event.type === 'sceneLoaded') this.sceneLoaded = true
    this.listeners.forEach((l) => l(d.event as BridgeEvent))
  }

  supports(cmd: BridgeCommand['type']) {
    return this.capabilities.includes(cmd)
  }

  send(cmd: BridgeCommand) {
    this.frame?.contentWindow?.postMessage({ source: 'polartwin-web', command: cmd }, this.origin || '*')
  }

  focusAsset(assetId: string) { this.send({ type: 'focusAsset', assetId }) }
  focusRoom(roomId: string) { this.send({ type: 'focusRoom', roomId }) }
  /** Asks the Unity host page to leave pointer lock (iframe-owned, parent cannot). */
  releasePointer() { this.send({ type: 'releasePointer' }) }
  resetCamera() { this.send({ type: 'resetCamera' }) }
  toggleLayer(layer: string, on: boolean) { this.send({ type: 'toggleLayer', layer, on }) }
  setHeatmap(on: boolean, variable: HeatVariable, opacity: number) {
    this.send({ type: 'setHeatmapMode', on, variable, opacity })
  }
  setHeatmapValues(values: Record<string, number>) { this.send({ type: 'setHeatmapValue', values }) }

  // The two setters below are de-duplicated: telemetry arrives every ~2 s and
  // we only want to cross the iframe boundary when something actually changed.
  highlightAsset(assetId: string | null, state: Health | 'selected') {
    const key = assetId ?? '*'
    if (this.lastHighlight.get(key) === state) return
    this.lastHighlight.set(key, state)
    this.send({ type: 'setAssetHighlight', assetId, state })
  }
  setRoomState(roomId: string, state: Health) {
    if (this.lastRoomState.get(roomId) === state) return
    this.lastRoomState.set(roomId, state)
    this.send({ type: 'setRoomState', roomId, state })
  }
}

export const digitalTwinBridge = new DigitalTwinBridge()
