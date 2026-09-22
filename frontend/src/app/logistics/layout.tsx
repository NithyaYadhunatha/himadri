import type { ReactNode } from 'react'
import { AccessGate } from '@/components/auth/AccessGate'

export default function LogisticsLayout({ children }: { children: ReactNode }) {
  return <AccessGate>{children}</AccessGate>
}
