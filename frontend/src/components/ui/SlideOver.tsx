// src/components/ui/SlideOver.tsx
'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

interface SlideOverProps {
  open: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  children: React.ReactNode
  width?: string
}

export function SlideOver({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 'w-[480px]',
}: SlideOverProps) {
  // Close on Escape
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-[#16283A]/45 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={`fixed right-0 top-0 h-full ${width} max-w-full bg-brand-surface border-l border-brand-border z-50 flex flex-col shadow-2xl`}
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
                <button
                  onClick={onClose}
                  className="text-white/62 hover:text-white transition-colors p-1 rounded hover:bg-white/5"
                  aria-label="Close panel"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
