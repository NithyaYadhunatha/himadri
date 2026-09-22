import type { ReactNode } from 'react'
import { AccessGate } from '@/components/auth/AccessGate'

export default function EnvironmentLayout({ children }: { children: ReactNode }) {
  return <AccessGate>{children}</AccessGate>
}
