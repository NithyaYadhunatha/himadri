// src/app/waiting-approval/page.tsx
//
// Shown to a signed-in Clerk user whose Membership isn't ACTIVE yet (no
// admin has assigned them a department/role). Deliberately outside
// AccessGate's protection so it can't itself redirect in a loop.

import { redirect } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { ShieldAlert } from 'lucide-react'
import { getCurrentMembership } from '@/lib/auth/rbac'
import { DEV_BYPASS_AUTH } from '@/lib/auth/devBypass'
import { Card } from '@/components/ui/Card'

export default async function WaitingApprovalPage() {
  // Local-dev-only: under DEV_BYPASS_AUTH, getCurrentMembership() always
  // succeeds, so this page should never actually be reached — redirect away
  // immediately rather than touching Clerk's auth() (see devBypass.ts).
  if (DEV_BYPASS_AUTH) redirect('/twin')

  const { userId } = await import('@clerk/nextjs/server').then((m) => m.auth())
  if (!userId) redirect('/sign-in')

  const membership = await getCurrentMembership()
  if (membership) redirect('/twin')

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="max-w-md w-full flex flex-col items-center text-center gap-4 py-10">
        <div className="w-12 h-12 rounded-lg bg-amber/10 border border-amber/40 flex items-center justify-center">
          <ShieldAlert size={22} className="text-amber" />
        </div>
        <div>
          <h1 className="font-mono text-sm font-semibold tracking-widest text-white uppercase">
            Awaiting Access
          </h1>
          <p className="text-white/70 text-sm mt-2 leading-relaxed">
            You&apos;re signed in — a Station Leader or HQ Operator needs to assign you a station and role before
            you can access HIMADRI. Refresh this page once you&apos;ve been notified.
          </p>
        </div>
        <UserButton />
      </Card>
    </div>
  )
}
