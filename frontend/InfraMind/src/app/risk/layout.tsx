import type { ReactNode } from 'react'
import { AccessGate } from '@/components/auth/AccessGate'

export default function RiskLayout({ children }: { children: ReactNode }) {
  return <AccessGate>{children}</AccessGate>
}
