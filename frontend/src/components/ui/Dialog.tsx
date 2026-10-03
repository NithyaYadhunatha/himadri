// src/components/ui/Dialog.tsx
//
// Shared modal shell — extracted out of ScenarioToolbar so AIReportModal can
// reuse the same overlay/escape/scroll behavior instead of duplicating it.
'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'

export function Dialog({
  open,
  onClose,
  title,
  children,
  width = 'max-w-md',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  width?: string
}) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#16283A]/45 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`relative z-10 w-full ${width} bg-brand-surface border border-brand-border rounded shadow-2xl flex flex-col max-h-[80vh]`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border shrink-0">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-white">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-white/62 hover:text-white transition-colors p-1 rounded hover:bg-white/5"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
