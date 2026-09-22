// src/lib/socket.ts
//
// Thin wrapper around the backend's WS /ws stream (backend/routers/websocket.py).
// Frames arrive as { event: string, node_id: string | null, data: object } —
// `event` is one of: metrics.updated | alert.triggered | node.status_changed
// | simulation.result | node.registered | connected (an initial handshake
// frame with no node_id). subscribe(eventType, handler) maps 1:1 onto that
// `event` field.

type MessageHandler = (data: unknown, nodeId: string | null) => void

class SocketManager {
  private ws: WebSocket | null = null
  private handlers: Map<string, Set<MessageHandler>> = new Map()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private url: string

  constructor(url: string) {
    this.url = url
  }

  connect(): void {
    if (typeof window === 'undefined') return
    if (this.ws?.readyState === WebSocket.OPEN) return

    try {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        this.reconnectAttempts = 0
      }

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const message = JSON.parse(event.data as string) as {
            event: string
            node_id: string | null
            data: unknown
          }
          const handlers = this.handlers.get(message.event)
          if (handlers) {
            handlers.forEach((handler) => handler(message.data, message.node_id))
          }
        } catch {
          // ignore malformed messages
        }
      }

      this.ws.onclose = () => {
        this.scheduleReconnect()
      }

      this.ws.onerror = () => {
        this.ws?.close()
      }
    } catch {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return
    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(
      () => this.connect(),
      Math.min(1000 * 2 ** this.reconnectAttempts, 30000)
    )
  }

  subscribe(eventType: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set())
    }
    this.handlers.get(eventType)!.add(handler)

    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.connect()
    }

    return () => {
      this.handlers.get(eventType)?.delete(handler)
    }
  }

  send(type: string, payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }))
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
    this.handlers.clear()
  }
}

const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000/ws'
export const socket = new SocketManager(wsUrl)
export default socket
