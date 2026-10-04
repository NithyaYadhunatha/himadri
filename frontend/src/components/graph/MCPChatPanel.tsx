'use client'

// Floating MCP chat panel for the Digital Twin page.
//
// Collapsed: a small circular button (bottom-right). Expanded: a 380×500
// floating panel with message history, input, and a "thinking..." indicator.
//
// Session is created/resumed via POST /api/chat/sessions (sessionType='mcp',
// contextKey='mcp:live') on first open so history persists across reloads.
// Each turn calls POST /api/chat/mcp with a compact nodesSummary derived from
// the live nodes array passed as a prop.

import { useState, useEffect, useRef, useCallback } from 'react'
import { MessageSquare, X, Send, Loader2, Bot } from 'lucide-react'
import { ChatMarkdown } from '@/components/ui/ChatMarkdown'
import type { GraphNode } from '@/types/graph'

interface ChatMessage {
  role: 'user' | 'ai'
  text: string
}

interface PersistedMessage {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  /** Live canvas nodes, when the caller has some loaded (e.g. /twin) — gives
   * the assistant a compact live-state summary up front. Optional: this
   * panel is mounted globally (DashboardLayout) so most pages have none to
   * pass; the MCP tool-calling loop fetches real backend data regardless,
   * this is just a head-start, not the only source of truth. */
  nodes?: GraphNode[]
}

function buildNodesSummary(nodes: GraphNode[]) {
  const healthy = nodes.filter((n) => n.health === 'healthy' || (!n.isSimulating && n.healthScore >= 80)).length
  const degraded = nodes.filter((n) => !n.isSimulating && n.health === 'degraded').length
  const critical = nodes.filter((n) => !n.isSimulating && n.health === 'critical').length
  const offline = nodes.filter((n) => !n.isSimulating && n.health === 'unreachable').length
  const simulating = nodes.filter((n) => n.isSimulating).length
  const types = [...new Set(nodes.map((n) => n.type))].sort()
  const atRisk = nodes
    .filter((n) => !n.isSimulating && n.health === 'degraded')
    .sort((a, b) => a.healthScore - b.healthScore)
    .slice(0, 5)
    .map((n) => n.label)
  const criticalLabels = nodes
    .filter((n) => !n.isSimulating && (n.health === 'critical' || n.health === 'unreachable'))
    .slice(0, 5)
    .map((n) => n.label)
  return { total: nodes.length, healthy, degraded, critical, offline, simulating, types, atRisk, criticalLabels }
}

export function MCPChatPanel({ nodes = [] }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const sessionInitiated = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Scroll to bottom whenever messages change or the panel opens.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open])

  // Focus input when panel opens.
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [open])

  // Create/resume session on first open, then load prior history.
  useEffect(() => {
    if (!open || sessionInitiated.current) return
    sessionInitiated.current = true

    fetch('/api/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionType: 'mcp', contextKey: 'mcp:live', title: 'Station Twin Chat' }),
    })
      .then((r) => r.json())
      .then((data: { session?: { _id: string } }) => {
        const sid = data.session?._id
        if (!sid) return
        setSessionId(sid)
        // Restore prior messages
        return fetch(`/api/chat/sessions/${sid}`)
          .then((r) => r.json())
          .then((d: { messages?: PersistedMessage[] }) => {
            const prior = (d.messages ?? []).map((m) => ({
              role: m.role === 'assistant' ? ('ai' as const) : ('user' as const),
              text: m.content,
            }))
            if (prior.length > 0) setMessages(prior)
          })
      })
      .catch(() => {})
  }, [open])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || thinking) return
    setInput('')
    setError(null)
    const userMsg: ChatMessage = { role: 'user', text }
    setMessages((prev) => [...prev, userMsg])
    setThinking(true)

    const history = messages.map((m) => ({ role: m.role, text: m.text }))
    const nodesSummary = nodes.length > 0 ? buildNodesSummary(nodes) : undefined

    try {
      const res = await fetch('/api/chat/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history, nodesSummary, sessionId: sessionId ?? undefined }),
      })
      const data = await res.json() as { reply?: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? `Request failed (${res.status})`)

      const aiMsg: ChatMessage = { role: 'ai', text: data.reply ?? '' }
      setMessages((prev) => [...prev, aiMsg])

      // Persist fire-and-forget
      if (sessionId) {
        fetch(`/api/chat/sessions/${sessionId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              { role: 'user', content: text },
              { role: 'assistant', content: data.reply ?? '' },
            ],
          }),
        }).catch(() => {})
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setThinking(false)
    }
  }, [input, thinking, messages, nodes, sessionId])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessage()
      }
    },
    [sendMessage]
  )

  return (
    <>
      {/* Collapsed toggle button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="print:hidden fixed bottom-6 right-6 z-50 inline-flex items-center gap-2.5 rounded-full bg-white pl-4 pr-5 py-3 shadow-[0_8px_30px_-8px_rgba(8,3,48,0.55)] hover:-translate-y-0.5 transition-transform"
          aria-label="Ask Himadri"
        >
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full rounded-full bg-marigold opacity-70 animate-ping" /><span className="relative inline-flex rounded-full h-2 w-2 bg-marigold" /></span>
          <MessageSquare size={15} className="text-brand-surface" />
          <span className="font-mono text-[11px] uppercase tracking-wider text-brand-surface">Ask Himadri</span>
        </button>
      )}

      {/* Expanded panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col w-[400px] max-w-[calc(100vw-2rem)] h-[540px] bg-brand-surface border border-brand-border rounded-2xl shadow-[0_24px_60px_-20px_rgba(8,3,48,0.45)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border shrink-0 bg-brand-bg">
            <div className="flex items-center gap-2">
              <Bot size={14} className="text-cyan" />
              <span className="font-display text-[16px] text-white">Ask Himadri</span>
              {nodes.length > 0 && (
                <span className="font-mono text-[10px] text-white/55">· {nodes.length} assets</span>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/55 hover:text-white transition-colors"
              aria-label="Close chat"
            >
              <X size={14} />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.length === 0 && !thinking && (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <Bot size={28} className="text-cyan/40 mb-3" />
                <p className="font-display text-[18px] text-white leading-snug">Ask the station anything.</p>
                <p className="font-mono text-[10.5px] text-white/65 leading-relaxed mt-1.5 mb-4">Answers come from live station data, with the source named.</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {["How long will our fuel last?", "Any open alerts?", "Is the convoy ready to leave?", "Is the audit chain intact?", "How is the uplink?", "Weather outlook?"].map((q) => (
                    <button key={q} onClick={() => setInput(q)} className="rounded-full border border-brand-border bg-brand-surface px-3 py-1.5 font-mono text-[10.5px] text-white/70 hover:border-cyan hover:text-cyan transition">{q}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-[12px] font-sans leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-cyan/15 text-white border border-cyan/20 whitespace-pre-wrap'
                      : 'bg-brand-bg text-white/90 border border-brand-border'
                  }`}
                >
                  {msg.role === 'ai' ? <ChatMarkdown text={msg.text} /> : msg.text}
                </div>
              </div>
            ))}

            {thinking && (
              <div className="flex justify-start">
                <div className="bg-brand-bg border border-brand-border rounded-lg px-3 py-2 flex items-center gap-2">
                  <Loader2 size={12} className="text-cyan animate-spin" />
                  <span className="font-mono text-[11px] text-white/62">Thinking...</span>
                </div>
              </div>
            )}

            {error && (
              <div className="text-[11px] font-mono text-crimson bg-crimson/10 border border-crimson/20 rounded px-3 py-2">
                {error}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-brand-border px-3 py-2 bg-brand-bg flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about fuel, alerts, convoy, link…"
              rows={2}
              className="flex-1 resize-none bg-brand-surface border border-brand-border rounded px-3 py-2 text-[12px] font-sans text-white placeholder:text-white/55 focus:outline-none focus:border-cyan/50 transition-colors"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || thinking}
              className="shrink-0 w-8 h-8 rounded flex items-center justify-center bg-cyan text-brand-bg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-cyan/80 transition-colors"
              aria-label="Send message"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
