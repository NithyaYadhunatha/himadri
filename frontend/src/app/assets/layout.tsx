import type { ReactNode } from 'react'
import { AccessGate } from '@/components/auth/AccessGate'

export default function AssetsLayout({ children }: { children: ReactNode }) {
  return <AccessGate>{children}</AccessGate>
}
