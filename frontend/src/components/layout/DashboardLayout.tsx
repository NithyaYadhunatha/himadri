// src/components/layout/DashboardLayout.tsx
'use client'

import { usePathname } from 'next/navigation'
import { Navbar } from './Navbar'
import { MCPChatPanel } from '@/components/graph/MCPChatPanel'

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isChromeless =
    pathname === '/' ||
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/sign-up')

  if (isChromeless) {
    return <div className="min-h-screen bg-brand-bg flex flex-col">{children}</div>
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <Navbar />
      <main className="flex-1 overflow-hidden relative">
        {children}
      </main>
      {/* Operations Agent — a floating chat widget on every app page (not a
          nav destination — see constants.ts's NAV_GROUPS comment). */}
      <MCPChatPanel />
    </div>
  )
}
