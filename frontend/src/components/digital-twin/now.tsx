'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const NowCtx = createContext(0)
/** One shared 1 s clock for every panel (no per-component timers). */
export function NowProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return <NowCtx.Provider value={now}>{children}</NowCtx.Provider>
}
export const useNow = () => useContext(NowCtx)

export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}
