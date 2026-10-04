// src/components/ui/CenteredModal.tsx
'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

interface CenteredModalProps {
  open: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  /** Extra control rendered in the header, left of the close button — e.g. a refresh icon. */
  headerAction?: React.ReactNode
  children: React.ReactNode
  width?: string
  /** Render inside an existing layout rail instead of as a blocking overlay. */
  embedded?: boolean
}

export function CenteredModal({
  open,
  onClose,
  title,
  subtitle,
  headerAction,
  children,
  width = 'w-full max-w-[520px]',
  embedded = false,
}: CenteredModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          {!embedded && <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 bg-[#16283A]/50 backdrop-blur-sm z-40"
            onClick={onClose}
          />}

          {/* Overlay panel or layout-embedded panel */}
          <div className={embedded ? 'h-full min-h-0' : 'fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none'}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320, duration: 0.22 }}
              className={`${embedded ? 'w-full max-w-none h-full rounded-none border-0 shadow-none max-h-none' : `${width} border border-brand-border rounded-xl shadow-2xl max-h-[90vh]`} bg-brand-surface flex flex-col pointer-events-auto`}
            >
              {/* Header */}
              {(title || subtitle) && (
                <div className="flex items-start justify-between p-4 border-b border-brand-border shrink-0">
                  <div>
                    {title && (
                      <h2 className="font-mono text-sm font-semibold tracking-wider text-white uppercase">
                        {title}
                      </h2>
                    )}
                    {subtitle && (
                      <p className="text-white/62 text-xs mt-0.5">{subtitle}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {headerAction}
                    <button
                      onClick={onClose}
                      className="text-white/62 hover:text-white transition-colors p-1 rounded hover:bg-white/5"
                      aria-label="Close"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              )}

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto">{children}</div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
