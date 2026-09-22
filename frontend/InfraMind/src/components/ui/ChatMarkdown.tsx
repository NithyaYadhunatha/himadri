// src/components/ui/ChatMarkdown.tsx
//
// Lightweight markdown-ish renderer for LLM chat replies (CAB Co-Pilot chat,
// MCP Digital Twin chat, CAB report briefing). Models reliably produce a
// small, predictable subset of markdown in short chat turns — **bold**,
// *italic*, `code`, bullet/numbered lists, paragraph breaks — so a tiny
// hand-rolled parser covers it without pulling in a full markdown+plugin
// dependency for a handful of chat bubbles.
'use client'

import type { ReactNode } from 'react'

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = []
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|_[^_]+_)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let i = 0
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    const token = match[0]
    const key = `${keyPrefix}-${i++}`
    if (token.startsWith('**')) {
      parts.push(
        <strong key={key} className="font-semibold text-inherit">
          {token.slice(2, -2)}
        </strong>
      )
    } else if (token.startsWith('`')) {
      parts.push(
        <code key={key} className="bg-white/10 rounded px-1 py-0.5 text-[0.9em] font-mono">
          {token.slice(1, -1)}
        </code>
      )
    } else {
      parts.push(<em key={key}>{token.slice(1, token.length - 1)}</em>)
    }
    lastIndex = match.index + token.length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

export function ChatMarkdown({ text, className = '' }: { text: string; className?: string }) {
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let listItems: string[] = []
  let listOrdered = false
  let inList = false
  let paraLines: string[] = []

  const flushPara = (key: string) => {
    if (paraLines.length === 0) return
    blocks.push(
      <p key={key}>{renderInline(paraLines.join(' '), key)}</p>
    )
    paraLines = []
  }

  const flushList = (key: string) => {
    if (!inList) return
    const items = listItems
    blocks.push(
      listOrdered ? (
        <ol key={key} className="list-decimal pl-5 space-y-0.5">
          {items.map((item, idx) => (
            <li key={`${key}-${idx}`}>{renderInline(item, `${key}-${idx}`)}</li>
          ))}
        </ol>
      ) : (
        <ul key={key} className="list-disc pl-5 space-y-0.5">
          {items.map((item, idx) => (
            <li key={`${key}-${idx}`}>{renderInline(item, `${key}-${idx}`)}</li>
          ))}
        </ul>
      )
    )
    listItems = []
    inList = false
  }

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim()
    const bulletMatch = /^[-*•]\s+(.*)/.exec(line)
    const numberedMatch = /^\d+[.)]\s+(.*)/.exec(line)

    if (bulletMatch) {
      flushPara(`p-${idx}`)
      if (inList && listOrdered) flushList(`l-${idx}`)
      inList = true
      listOrdered = false
      listItems.push(bulletMatch[1])
    } else if (numberedMatch) {
      flushPara(`p-${idx}`)
      if (inList && !listOrdered) flushList(`l-${idx}`)
      inList = true
      listOrdered = true
      listItems.push(numberedMatch[1])
    } else if (line === '') {
      flushList(`l-${idx}`)
      flushPara(`p-${idx}`)
    } else {
      flushList(`l-${idx}`)
      paraLines.push(line)
    }
  })
  flushList('l-end')
  flushPara('p-end')

  return <div className={`space-y-2 ${className}`}>{blocks}</div>
}
