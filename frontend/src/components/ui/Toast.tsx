// src/components/ui/Toast.tsx
//
// Lightweight bottom-right toast stack. No external toast library in the
// project yet — this is a small self-contained primitive (state hook +
// stack renderer) rather than a global provider, since only one screen
// needs it today (Scenario Builder's AI Copilot reply). Promote to a
// context-based app-wide version if a second screen needs it.
//
// A toast with `actions` is decision-shaped (e.g. "Okay" / "Revert" after an
// AI edit) rather than a plain notification: it never auto-dismisses and has
// no manual close (X) button either — dismissing it without picking an
// action would silently apply the AI's change, which defeats the point of
// asking. It only goes away when one of its actions is clicked, and that
// action is responsible for calling dismissToast itself.

'use client'

import { useCallback, useRef, useState } from 'react'
import { Sparkles, AlertTriangle, X } from 'lucide-react'

export interface ToastAction {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary'
}

export interface ToastItem {
  id: string
  variant: 'info' | 'error'
  title?: string
  message: string
  /** Presence of actions makes the toast persistent — see file header. */
  actions?: ToastAction[]
}

const DEFAULT_AUTO_DISMISS_MS = 7000

export function useToasts(autoDismissMs: number = DEFAULT_AUTO_DISMISS_MS) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const showToast = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      setToasts((prev) => [...prev, { ...toast, id }])
      // Action toasts (Okay/Revert, etc.) wait for an explicit choice —
      // an unattended auto-dismiss would silently "accept" the AI's edit.
      if (!toast.actions?.length) {
        timers.current.set(
          id,
          setTimeout(() => dismissToast(id), autoDismissMs)
        )
      }
      return id
    },
    [autoDismissMs, dismissToast]
  )

  return { toasts, showToast, dismissToast }
}

export function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2.5rem)] pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`animate-slide-in-right pointer-events-auto flex flex-col gap-2.5 rounded border bg-brand-surface px-3.5 py-3 shadow-lg backdrop-blur-sm ${
            t.variant === 'error' ? 'border-crimson/40 shadow-crimson-glow' : 'border-cyan/40 shadow-cyan-glow'
          }`}
        >
          <div className="flex items-start gap-2.5">
            <div className="shrink-0 mt-0.5">
              {t.variant === 'error' ? (
                <AlertTriangle size={14} className="text-crimson" />
              ) : (
                <Sparkles size={14} className="text-cyan" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              {t.title && <p className="font-mono text-[10px] uppercase tracking-widest text-white/70 mb-1">{t.title}</p>}
              <p className="text-xs font-sans text-white/80 leading-snug">{t.message}</p>
            </div>
            {!t.actions?.length && (
              <button
                onClick={() => onDismiss(t.id)}
                className="shrink-0 text-white/55 hover:text-white/70 transition-colors"
                aria-label="Dismiss notification"
              >
                <X size={13} />
              </button>
            )}
          </div>
          {t.actions && t.actions.length > 0 && (
            <div className="flex justify-end gap-2 pl-[26px]">
              {t.actions.map((action) => (
                <button
                  key={action.label}
                  onClick={action.onClick}
                  className={`font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 rounded border transition-colors ${
                    action.variant === 'secondary'
                      ? 'border-brand-border text-white/75 hover:text-white hover:border-white/40'
                      : 'border-cyan/40 text-cyan hover:bg-cyan/10'
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
