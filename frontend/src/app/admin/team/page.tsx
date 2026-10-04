// src/app/admin/team/page.tsx
//
// Admin-only team management: invite people by email (pre-assigning
// department/role so they land ACTIVE the moment they sign up), approve
// existing pending signups, edit/revoke active members, and search across
// all three as the user count grows. Gated by src/app/admin/layout.tsx
// (ADMIN role required) on top of the API routes' own requireRole checks.
'use client'

import { useEffect, useState, useCallback } from 'react'
import { Users, Check, X, Loader2, Search, Mail, Send } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
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
  'bg-brand-bg border border-brand-border rounded text-xs text-white/80 px-2 py-1.5 focus:border-cyan outline-none'

export default function AdminTeamPage() {
  const [pending, setPending] = useState<PendingUser[]>([])
  const [members, setMembers] = useState<ActiveMember[]>([])
  const [invited, setInvited] = useState<InvitedUser[]>([])
  const [loading, setLoading] = useState(true)
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

  const load = useCallback(async (q: string) => {
    setLoading(true)
    if (USE_MOCK) {
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
      // returns a non-2xx with an empty or non-JSON body — .json() on that
      // throws "Unexpected end of JSON input" and crashes the whole page
      // rather than just showing empty sections. Never trust .ok here.
      const pendingData = pendingRes.ok ? await pendingRes.json().catch(() => ({})) : {}
      const membersData = membersRes.ok ? await membersRes.json().catch(() => ({})) : {}
      const invitedData = invitedRes.ok ? await invitedRes.json().catch(() => ({})) : {}
      setPending(pendingData.pending ?? [])
      setMembers(membersData.members ?? [])
      setInvited(invitedData.invitations ?? [])
    } catch {
      setPending([])
      setMembers([])
      setInvited([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(debouncedSearch)
  }, [load, debouncedSearch])

  const admins = members.filter((m) => m.role === 'STATION_LEADER' || m.role === 'HQ_OPERATOR')

  const choiceFor = (membershipId: string) =>
    pendingChoices[membershipId] ?? { department: DEPARTMENTS[0], role: ROLES[1] }

  const approve = async (membershipId: string) => {
    const choice = choiceFor(membershipId)
    setBusyId(membershipId)
    if (USE_MOCK) {
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
    if (USE_MOCK) {
      mockTeamAdmin.revokeMember(membershipId)
    } else {
      await fetch(`/api/admin/members/${membershipId}`, { method: 'DELETE' })
    }
    setBusyId(null)
    await load(debouncedSearch)
  }

  const revokeInvite = async (id: string) => {
    setBusyId(id)
    if (USE_MOCK) {
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
    if (!inviteEmail.includes('@')) {
      setInviteError('Enter a valid email address')
      return
    }
    setInviteBusy(true)
    if (USE_MOCK) {
      mockTeamAdmin.sendInvite(inviteEmail, inviteDepartment, inviteRole)
      setInviteBusy(false)
      setInviteSuccess(`Invite sent to ${inviteEmail}`)
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

  return (
    <div className="p-8 max-w-5xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan/10 border border-cyan/40 flex items-center justify-center">
            <Users size={16} className="text-cyan" />
          </div>
          <h1 className="font-mono text-sm font-semibold tracking-widest text-white uppercase">Team Management</h1>
        </div>

        <div className="relative w-full max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/55" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people by name or email…"
            className="w-full bg-brand-surface border border-brand-border rounded text-sm text-white pl-9 pr-3 py-2 focus:border-cyan outline-none placeholder:text-white/55"
          />
        </div>
      </div>

      <Card>
        <CardHeader title="Invite by Email" subtitle="Pre-assign a department and role — they land ACTIVE the moment they sign up" />
        <div className="mt-4 flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <label className="text-[11px] text-white/62 uppercase tracking-wider">Email</label>
            <div className="relative mt-1">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/55" />
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="person@company.com"
                className="w-full bg-brand-bg border border-brand-border rounded text-sm text-white pl-9 pr-3 py-2 focus:border-cyan outline-none placeholder:text-white/55"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-white/62 uppercase tracking-wider">Department</label>
            <select
              className={`${selectClass} mt-1 block`}
              value={inviteDepartment}
              onChange={(e) => setInviteDepartment(e.target.value as Department)}
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-white/62 uppercase tracking-wider">Role</label>
            <select
              className={`${selectClass} mt-1 block`}
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <Button variant="primary" size="md" icon={<Send size={14} />} loading={inviteBusy} onClick={sendInvite}>
            Send Invite
          </Button>
        </div>
        {inviteError && <p className="text-crimson text-xs mt-2">{inviteError}</p>}
        {inviteSuccess && <p className="text-emerald text-xs mt-2">{inviteSuccess}</p>}
      </Card>

      <Card noPad>
        <div className="p-4 border-b border-brand-border">
          <CardHeader title="Invited — Awaiting Signup" subtitle={`${invited.length} invitation(s) sent, not yet accepted`} />
        </div>
        {loading ? (
          <div className="p-6 flex justify-center text-white/62">
            <Loader2 className="animate-spin" size={18} />
          </div>
        ) : invited.length === 0 ? (
          <div className="p-6 text-center text-white/62 text-sm">No outstanding invitations.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/62 text-xs uppercase tracking-wider">
                <th className="px-4 py-2 font-normal">Email</th>
                <th className="px-4 py-2 font-normal">Department</th>
                <th className="px-4 py-2 font-normal">Role</th>
                <th className="px-4 py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {invited.map((inv) => (
                <tr key={inv.id} className="border-t border-brand-border">
                  <td className="px-4 py-2 text-white/80">{inv.email}</td>
                  <td className="px-4 py-2 text-white/75">{inv.department ?? '—'}</td>
                  <td className="px-4 py-2 text-white/75">{inv.role ?? '—'}</td>
                  <td className="px-4 py-2">
                    <Button
                      variant="danger"
                      size="sm"
                      icon={<X size={12} />}
                      loading={busyId === inv.id}
                      onClick={() => revokeInvite(inv.id)}
                    >
                      Revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card noPad>
        <div className="p-4 border-b border-brand-border">
          <CardHeader title="Pending Approvals" subtitle={`${pending.length} awaiting department/role assignment`} />
        </div>
        {loading ? (
          <div className="p-6 flex justify-center text-white/62">
            <Loader2 className="animate-spin" size={18} />
          </div>
        ) : pending.length === 0 ? (
          <div className="p-6 text-center text-white/62 text-sm">No pending signups.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/62 text-xs uppercase tracking-wider">
                <th className="px-4 py-2 font-normal">Name</th>
                <th className="px-4 py-2 font-normal">Email</th>
                <th className="px-4 py-2 font-normal">Department</th>
                <th className="px-4 py-2 font-normal">Role</th>
                <th className="px-4 py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {pending.map((p) => {
                const choice = choiceFor(p.membershipId)
                return (
                  <tr key={p.membershipId} className="border-t border-brand-border">
                    <td className="px-4 py-2 text-white/80">{p.name}</td>
                    <td className="px-4 py-2 text-white/75">{p.email}</td>
                    <td className="px-4 py-2">
                      <select
                        className={selectClass}
                        value={choice.department}
                        onChange={(e) =>
                          setPendingChoices((s) => ({
                            ...s,
                            [p.membershipId]: { ...choice, department: e.target.value as Department },
                          }))
                        }
                      >
                        {DEPARTMENTS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <select
                        className={selectClass}
                        value={choice.role}
                        onChange={(e) =>
                          setPendingChoices((s) => ({
                            ...s,
                            [p.membershipId]: { ...choice, role: e.target.value as Role },
                          }))
                        }
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<Check size={12} />}
                          loading={busyId === p.membershipId}
                          onClick={() => approve(p.membershipId)}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          icon={<X size={12} />}
                          loading={busyId === p.membershipId}
                          onClick={() => revoke(p.membershipId)}
                        >
                          Reject
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card noPad>
        <div className="p-4 border-b border-brand-border">
          <CardHeader title="Admins" subtitle={`${admins.length} with admin access — the main admin can't be removed here`} />
        </div>
        {loading ? (
          <div className="p-6 flex justify-center text-white/62">
            <Loader2 className="animate-spin" size={18} />
          </div>
        ) : admins.length === 0 ? (
          <div className="p-6 text-center text-white/62 text-sm">No admins yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/62 text-xs uppercase tracking-wider">
                <th className="px-4 py-2 font-normal">Name</th>
                <th className="px-4 py-2 font-normal">Email</th>
                <th className="px-4 py-2 font-normal">Type</th>
                <th className="px-4 py-2 font-normal">Role</th>
                <th className="px-4 py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {admins.map((m) => {
                const isMainAdmin = m.department === 'ADMIN'
                return (
                  <tr key={m.membershipId} className="border-t border-brand-border">
                    <td className="px-4 py-2 text-white/80">{m.name}</td>
                    <td className="px-4 py-2 text-white/75">{m.email}</td>
                    <td className="px-4 py-2">
                      {isMainAdmin ? (
                        <span className="text-[10px] font-mono uppercase tracking-wider text-amber bg-amber/10 border border-amber/30 rounded px-1.5 py-0.5">
                          Main Admin
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono uppercase tracking-wider text-cyan bg-cyan/10 border border-cyan/30 rounded px-1.5 py-0.5">
                          Department Admin — {m.department}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-white/75">{m.role}</td>
                    <td className="px-4 py-2">
                      {!isMainAdmin && (
                        <Button
                          variant="danger"
                          size="sm"
                          icon={<X size={12} />}
                          loading={busyId === m.membershipId}
                          onClick={() => revoke(m.membershipId)}
                        >
                          Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      <div className="flex flex-col gap-4">
        <CardHeader title="Department Overview" subtitle="Departments and their members" />
        {MOCK_TEAM_DIRECTORY.map((dept) => (
          <DepartmentTeamCard key={dept.id} department={dept} />
        ))}
      </div>
    </div>
  )
}
