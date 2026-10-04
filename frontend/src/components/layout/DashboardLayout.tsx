// src/components/layout/DashboardLayout.tsx
'use client'

import { usePathname } from 'next/navigation'
import { Navbar } from './Navbar'
import { StatusBar } from './StatusBar'
import { MCPChatPanel } from '@/components/graph/MCPChatPanel'
import { useChromeStore } from '@/store/useChromeStore'
import { DemoDirector } from '@/components/demo/DemoDirector'

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const chromeHidden = useChromeStore((s) => s.hidden)
  const isChromeless =
    pathname === '/' ||
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/sign-up')

  if (isChromeless) {
    return <div className="min-h-screen bg-brand-bg flex flex-col">{children}</div>
  }

  return (
    <div className="h-screen bg-brand-bg flex flex-col">
      {!chromeHidden && <Navbar />}
      {!chromeHidden && <StatusBar />}
      <main className="flex-1 min-h-0 overflow-hidden relative">
        {children}
      </main>
      {/* Operations Agent — a floating chat widget on every app page (not a
          nav destination — see constants.ts's NAV_GROUPS comment). */}
      {!chromeHidden && <MCPChatPanel />}
      <DemoDirector />
    </div>
  )
}
