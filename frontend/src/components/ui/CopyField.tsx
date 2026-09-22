// src/components/ui/CopyField.tsx
'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface CopyFieldProps {
  label: string
  value: string
}

export function CopyField({ label, value }: CopyFieldProps) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // clipboard API unavailable — silently ignore, value is still selectable
    }
  }

  return (
    <div>
      <p className="font-mono text-[10px] text-white/40 uppercase tracking-widest mb-1">{label}</p>
      <div className="flex items-center gap-2 bg-brand-bg border border-brand-border rounded px-3 py-2">
        <code className="flex-1 font-mono text-xs text-cyan break-all">{value}</code>
        <button
          onClick={copy}
          className="shrink-0 text-white/40 hover:text-white transition-colors p-1 rounded hover:bg-white/5"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check size={14} className="text-emerald" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  )
}
