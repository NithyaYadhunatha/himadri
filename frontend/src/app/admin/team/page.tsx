// src/app/admin/team/page.tsx
//
// Admin-only team management: invite people by email (pre-assigning
// department/role so they land ACTIVE the moment they sign up), approve
// existing pending signups, edit/revoke active members, and search across
// all of them as the user count grows. Gated by src/app/admin/layout.tsx
// (ADMIN role required) on top of the API routes' own requireRole checks.
//
// When no live directory is connected (Mongo/Clerk offline — every list comes
// back empty) the page falls back to a demo roster held in memory so it is
// never an empty shell; a banner says so and actions apply to the demo only.
'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Users, Check, X, Loader2, Search, Mail, Send, ShieldCheck, UserCheck, Clock, Info } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Kpi, Panel, PageHead, Pill, type Tone } from '@/components/ui/kit'
import { DEPARTMENTS, ROLES, type Department, type Role } from '@/lib/auth/constants'
import { DepartmentTeamCard } from '@/components/admin/DepartmentTeamCard'
import { MOCK_TEAM_DIRECTORY } from '@/lib/mockData/mockTeamDirectory'
import { mockTeamAdmin } from '@/lib/mockData/mockTeamAdmin'
import { USE_MOCK } from '@/lib/constants'

interface PendingUser {
  membershipId: string
  clerkUserId: string
  email: string
  name: string
  createdAt: string | null
}

interface ActiveMember {
  membershipId: string
  clerkUserId: string
  email: string
  name: string
  department: Department
  role: Role
  activatedAt: string | null
}

interface InvitedUser {
  id: string
  email: string
  department: Department | null
  role: Role | null
  createdAt: number | null
}

const selectClass =
  'rounded-lg border border-brand-border bg-brand-surface px-3 py-2.5 text-[14px] text-white focus:border-cyan focus:ring-2 focus:ring-cyan/20 outline-none'

const ROLE_LABEL: Record<Role, string> = {
  STATION_LEADER: 'Station Leader',
  ENGINEER: 'Engineer',
  SCIENTIST: 'Scientist',
  HQ_OPERATOR: 'HQ Operator',
  AUDITOR: 'Auditor',
}
const ROLE_TONE: Record<Role, Tone> = {
  STATION_LEADER: 'warn',
  HQ_OPERATOR: 'warn',
  ENGINEER: 'primary',
  SCIENTIST: 'ok',
  AUDITOR: 'mute',
}
const ROLE_DESC: Record<Role, string> = {
  STATION_LEADER: 'Full control of one station: approvals, commands, team.',
  HQ_OPERATOR: 'Both stations, team management, device & alert admin.',
  ENGINEER: 'Operate assets, issue commands (second approval where required).',
  SCIENTIST: 'View telemetry and instruments, log science data.',
  AUDITOR: 'Read-only across stations, including the audit chain.',
}
const DEPT_LABEL: Record<string, string> = { MAITRI: 'Maitri', BHARATI: 'Bharati', HQ_NCPOR: 'HQ · NCPOR', ADMIN: 'Platform admin' }

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
}
function ago(iso: string | number | null): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  const h = Math.round(ms / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}

function Empty({ children }: { children: string }) {
  return <div className="px-5 py-8 text-center text-[14px] text-white/75">{children}</div>
}
function Loading() {
  return <div className="p-8 flex justify-center text-white/70"><Loader2 className="animate-spin" size={18} /></div>
}

export default function AdminTeamPage() {
  const [pending, setPending] = useState<PendingUser[]>([])
  const [members, setMembers] = useState<ActiveMember[]>([])
  const [invited, setInvited] = useState<InvitedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [demo, setDemo] = useState(USE_MOCK)
  const [pendingChoices, setPendingChoices] = useState<Record<string, { department: Department; role: Role }>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteDepartment, setInviteDepartment] = useState<Department>(DEPARTMENTS[0])
  const [inviteRole, setInviteRole] = useState<Role>(ROLES[1])
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)

  // Debounce the search box so as the user base grows we're not firing a
  // Mongo query (+ a Clerk API call for invitations) on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const load = useCallback(async (q: string, forceDemo = demo) => {
    setLoading(true)
    if (forceDemo) {
      const { pending: p, members: m, invited: i } = mockTeamAdmin.load(q)
      setPending(p)
      setMembers(m)
      setInvited(i)
      setLoading(false)
      return
    }
    try {
      const qs = q ? `?q=${encodeURIComponent(q)}` : ''
      const [pendingRes, membersRes, invitedRes] = await Promise.all([
        fetch(`/api/admin/pending-users${qs}`),
        fetch(`/api/admin/members${qs}`),
        fetch(`/api/admin/invitations${qs}`),
      ])
      // Defensive: a down/misconfigured backend (e.g. MONGODB_URI unset)
      // returns a non-2xx with an empty or non-JSON body — never trust .ok here.
      const pendingData = pendingRes.ok ? await pendingRes.json().catch(() => ({})) : {}
      const membersData = membersRes.ok ? await membersRes.json().catch(() => ({})) : {}
      const invitedData = invitedRes.ok ? await invitedRes.json().catch(() => ({})) : {}
      const p: PendingUser[] = pendingData.pending ?? []
      const m: ActiveMember[] = membersData.members ?? []
      const i: InvitedUser[] = invitedData.invitations ?? []
      if (!q && p.length + m.length + i.length === 0) {
        // No live directory — show the demo roster instead of an empty page.
        setDemo(true)
        const d = mockTeamAdmin.load('')
        setPending(d.pending)
        setMembers(d.members)
        setInvited(d.invited)
      } else {
        setPending(p)
        setMembers(m)
        setInvited(i)
      }
    } catch {
      setDemo(true)
      const d = mockTeamAdmin.load(q)
      setPending(d.pending)
      setMembers(d.members)
      setInvited(d.invited)
    } finally {
      setLoading(false)
    }
  }, [demo])

  useEffect(() => {
    load(debouncedSearch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  const admins = useMemo(() => members.filter((m) => m.role === 'STATION_LEADER' || m.role === 'HQ_OPERATOR'), [members])

  const choiceFor = (membershipId: string) =>
    pendingChoices[membershipId] ?? { department: DEPARTMENTS[0], role: ROLES[1] }

  const approve = async (membershipId: string) => {
    const choice = choiceFor(membershipId)
    setBusyId(membershipId)
    if (demo) {
      mockTeamAdmin.approve(membershipId, choice.department, choice.role)
    } else {
      await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ membershipId, ...choice }),
      })
    }
    setBusyId(null)
    await load(debouncedSearch)
  }

  const revoke = async (membershipId: string) => {
    setBusyId(membershipId)
    if (demo) {
      mockTeamAdmin.revokeMember(membershipId)
      mockTeamAdmin.reject(membershipId)
    } else {
      await fetch(`/api/admin/members/${membershipId}`, { method: 'DELETE' })
    }
    setBusyId(null)
    await load(debouncedSearch)
  }

  const revokeInvite = async (id: string) => {
    setBusyId(id)
    if (demo) {
      mockTeamAdmin.revokeInvite(id)
    } else {
      await fetch(`/api/admin/invitations/${id}`, { method: 'DELETE' })
    }
    setBusyId(null)
    await load(debouncedSearch)
  }

  const sendInvite = async () => {
    setInviteError(null)
    setInviteSuccess(null)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inviteEmail)) {
      setInviteError('Enter a valid email address')
      return
    }
    setInviteBusy(true)
    if (demo) {
      mockTeamAdmin.sendInvite(inviteEmail, inviteDepartment, inviteRole)
      setInviteBusy(false)
      setInviteSuccess(`Invite sent to ${inviteEmail} (demo roster)`)
      setInviteEmail('')
      await load(debouncedSearch)
      return
    }
    const res = await fetch('/api/admin/invite-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, department: inviteDepartment, role: inviteRole }),
    })
    const data = await res.json().catch(() => ({}))
    setInviteBusy(false)
    if (!res.ok) {
      setInviteError(data.error ?? 'Failed to send invite')
      return
    }
    setInviteSuccess(`Invite sent to ${inviteEmail}`)
    setInviteEmail('')
    await load(debouncedSearch)
  }

  const th = 'px-5 py-3 text-left eyebrow font-semibold'

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1200px] mx-auto px-6 py-7 space-y-6">
        <PageHead
          eyebrow="Admin · Team"
          title="Team management."
          sub="Invite people, approve sign-ups and control who can operate each station."
          right={
            <div className="relative w-72 max-w-full">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/60" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search people by name or email…"
                className="w-full rounded-full border border-brand-border bg-brand-surface pl-10 pr-4 py-2.5 text-[14px] text-white focus:border-cyan focus:ring-2 focus:ring-cyan/20 outline-none"
              />
            </div>
          }
        />

        {demo && (
          <div className="flex items-start gap-3 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-[13.5px] text-white">
            <Info size={16} className="mt-0.5 shrink-0 text-amber" />
            <p>
              <b>Demo roster.</b> No live directory is connected (the membership database is offline), so this page shows a sample
              team. Approvals, removals and invites here apply to the demo only.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
          <Kpi label="Active members" value={members.length} tone="ok" icon={<UserCheck size={15} />} hint="with station access" />
          <Kpi label="Admins" value={admins.length} tone="primary" icon={<ShieldCheck size={15} />} hint="leaders & HQ operators" />
          <Kpi label="Pending approval" value={pending.length} tone={pending.length ? 'warn' : 'ink'} icon={<Clock size={15} />} hint="awaiting a role" />
          <Kpi label="Invites out" value={invited.length} tone="ink" icon={<Mail size={15} />} hint="sent, not yet accepted" />
        </div>

        <Panel eyebrow="Onboarding" title="Invite by email" right={<Users size={16} className="text-white/60" />}>
          <p className="text-[13.5px] text-white/80 mb-4">Pre-assign a station and role — they land ACTIVE the moment they sign up.</p>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[240px]">
              <label className="eyebrow block mb-1.5">Email</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/60" />
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="person@ncpor.gov.in"
                  className={`${selectClass} w-full pl-10`}
                />
              </div>
            </div>
            <div>
              <label className="eyebrow block mb-1.5">Station</label>
              <select className={selectClass} value={inviteDepartment} onChange={(e) => setInviteDepartment(e.target.value as Department)}>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{DEPT_LABEL[d] ?? d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="eyebrow block mb-1.5">Role</label>
              <select className={selectClass} value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            </div>
            <Button variant="primary" size="lg" icon={<Send size={14} />} loading={inviteBusy} onClick={sendInvite}>
              Send invite
            </Button>
          </div>
          <p className="mt-3 text-[13px] text-white/75"><b className="text-white">{ROLE_LABEL[inviteRole]}:</b> {ROLE_DESC[inviteRole]}</p>
          {inviteError && <p className="text-crimson text-[13.5px] mt-2 font-medium">{inviteError}</p>}
          {inviteSuccess && <p className="text-emerald text-[13.5px] mt-2 font-medium">{inviteSuccess}</p>}
        </Panel>

        <div className="grid xl:grid-cols-2 gap-6 items-start">
          <Panel eyebrow="Sign-ups" title="Pending approvals" right={<Pill tone={pending.length ? 'warn' : 'ok'}>{pending.length} waiting</Pill>} pad={false}>
            {loading ? <Loading /> : pending.length === 0 ? <Empty>No pending sign-ups — everyone has a role.</Empty> : (
              <ul className="divide-y divide-brand-border/70">
                {pending.map((p) => {
                  const choice = choiceFor(p.membershipId)
                  return (
                    <li key={p.membershipId} className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan/10 border border-cyan/30 text-[13px] font-semibold text-cyan">{initials(p.name)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-semibold text-white truncate">{p.name}</p>
                          <p className="text-[13px] text-white/75 truncate">{p.email} · {ago(p.createdAt)}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <select className={`${selectClass} !py-2 !text-[13px]`} value={choice.department}
                          onChange={(e) => setPendingChoices((s) => ({ ...s, [p.membershipId]: { ...choice, department: e.target.value as Department } }))}>
                          {DEPARTMENTS.map((d) => <option key={d} value={d}>{DEPT_LABEL[d] ?? d}</option>)}
                        </select>
                        <select className={`${selectClass} !py-2 !text-[13px]`} value={choice.role}
                          onChange={(e) => setPendingChoices((s) => ({ ...s, [p.membershipId]: { ...choice, role: e.target.value as Role } }))}>
                          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                        </select>
                        <div className="ml-auto flex gap-2">
                          <Button variant="primary" size="sm" icon={<Check size={12} />} loading={busyId === p.membershipId} onClick={() => approve(p.membershipId)}>Approve</Button>
                          <Button variant="danger" size="sm" icon={<X size={12} />} loading={busyId === p.membershipId} onClick={() => revoke(p.membershipId)}>Reject</Button>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          <Panel eyebrow="Invitations" title="Awaiting sign-up" right={<Pill tone="mute">{invited.length} sent</Pill>} pad={false}>
            {loading ? <Loading /> : invited.length === 0 ? <Empty>No outstanding invitations.</Empty> : (
              <ul className="divide-y divide-brand-border/70">
                {invited.map((inv) => (
                  <li key={inv.id} className="flex items-center gap-3 px-5 py-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-surface-3 text-white/80"><Mail size={16} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-white truncate">{inv.email}</p>
                      <p className="text-[13px] text-white/75">
                        {inv.department ? (DEPT_LABEL[inv.department] ?? inv.department) : '—'} · {inv.role ? ROLE_LABEL[inv.role] : '—'} · sent {ago(inv.createdAt)}
                      </p>
                    </div>
                    <Button variant="danger" size="sm" icon={<X size={12} />} loading={busyId === inv.id} onClick={() => revokeInvite(inv.id)}>Revoke</Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel eyebrow="Access" title="Active members" right={<Pill tone="ok">{members.length} active</Pill>} pad={false}>
          {loading ? <Loading /> : members.length === 0 ? <Empty>No members match your search.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-brand-border/70">
                    <th className={th}>Member</th>
                    <th className={th}>Station</th>
                    <th className={th}>Role</th>
                    <th className={th}>Access</th>
                    <th className={th}>Active since</th>
                    <th className={th}></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/60">
                  {members.map((m) => {
                    const isMainAdmin = m.department === 'ADMIN'
                    const isAdmin = m.role === 'STATION_LEADER' || m.role === 'HQ_OPERATOR'
                    return (
                      <tr key={m.membershipId} className="hover:bg-brand-surface-2/60">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan/10 border border-cyan/30 text-[12px] font-semibold text-cyan">{initials(m.name)}</span>
                            <div className="min-w-0">
                              <p className="font-semibold text-white truncate">{m.name}</p>
                              <p className="text-[13px] text-white/75 truncate">{m.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-white">{DEPT_LABEL[m.department] ?? m.department}</td>
                        <td className="px-5 py-3"><Pill tone={ROLE_TONE[m.role]}>{ROLE_LABEL[m.role]}</Pill></td>
                        <td className="px-5 py-3 text-[13px] text-white/80">{isMainAdmin ? 'Main admin' : isAdmin ? 'Admin' : 'Standard'}</td>
                        <td className="px-5 py-3 text-white/80 whitespace-nowrap">{ago(m.activatedAt)}</td>
                        <td className="px-5 py-3 text-right">
                          {!isMainAdmin && (
                            <Button variant="danger" size="sm" icon={<X size={12} />} loading={busyId === m.membershipId} onClick={() => revoke(m.membershipId)}>Remove</Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel eyebrow="Reference" title="What each role can do">
          <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
            {ROLES.map((r) => (
              <div key={r} className="rounded-xl border border-brand-border bg-brand-surface-2/60 p-4">
                <Pill tone={ROLE_TONE[r]}>{ROLE_LABEL[r]}</Pill>
                <p className="mt-2.5 text-[13.5px] text-white leading-snug">{ROLE_DESC[r]}</p>
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          <div>
            <p className="eyebrow">Directory</p>
            <h2 className="font-display text-[22px] text-white mt-0.5">Station rosters</h2>
          </div>
          {MOCK_TEAM_DIRECTORY.map((dept) => (
            <DepartmentTeamCard key={dept.id} department={dept} />
          ))}
        </div>
      </div>
    </div>
  )
}
