'use client'
// src/app/logs/page.tsx
//
// Activity Logs page — two lenses over the same ActivityLog collection:
//   Activity Feed  — full chronological feed, all actions, all filters open
//   Audit Log      — preset to security-sensitive actions (auditOnly=true on
//                    /api/logs), all other filters still available
//
// RBAC gate is in layout.tsx (ADMIN only). The /api/logs route enforces the
// same gate server-side so a non-admin who bypasses the redirect still gets 403.
//
// Fetch pattern: fetchLogData is a module-level pure async function so no
// setState is called synchronously inside the useEffect body. All setState
// calls live in .then() / .catch() / .finally() chains (async), which avoids
// the react-hooks/set-state-in-effect lint rule. setLoading(true) is called
// in event handlers before state changes that trigger the effect to re-run.

import { useState, useEffect } from 'react'
import {
  ScrollText,
  Shield,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { DEPARTMENTS } from '@/lib/auth/constants'

interface LogEntry {
  id: string
  actorEmail: string
  action: string
  targetType: string
  targetId: string | null
  metadata: unknown
  department: string | null
  createdAt: string
}

interface LogsResponse {
  logs: LogEntry[]
  total: number
  page: number
  limit: number
  pages: number
}

type ViewMode = 'feed' | 'audit'

interface FilterState {
  actorEmail: string
  action: string
  department: string
  dateFrom: string
  dateTo: string
}

const EMPTY_FILTERS: FilterState = {
  actorEmail: '',
  action: '',
  department: '',
  dateFrom: '',
  dateTo: '',
}

// Security-sensitive actions that constitute the Audit Log preset.
// Must mirror AUDIT_ACTIONS in src/app/api/logs/route.ts.
const AUDIT_ACTIONS = [
  'member.approve',
  'member.revoke',
  'member.update',
  'architecture.share',
  'architecture.delete',
  'remediation.execute',
  'invitation.send',
  'invitation.revoke',
]

// Per-action colour hints so the action column is scannable at a glance.
const ACTION_COLOR: Record<string, string> = {
  'architecture.create': 'text-cyan',
  'architecture.update': 'text-cyan/60',
  'architecture.delete': 'text-crimson',
  'architecture.share': 'text-amber',
  'simulation.analyze': 'text-emerald',
  'simulation.outcome_logged': 'text-emerald/60',
  'shadow_run.start': 'text-purple-400',
  'remediation.execute': 'text-orange-400',
  'member.approve': 'text-emerald',
  'member.revoke': 'text-crimson',
  'member.update': 'text-amber',
  'invitation.send': 'text-cyan/60',
  'invitation.revoke': 'text-crimson/60',
  'node_business_meta.update': 'text-white/50',
}

function actionColor(action: string): string {
  return ACTION_COLOR[action] ?? 'text-white/40'
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function deptLabel(dept: string | null): string {
  return dept ? dept.replace(/_/g, ' ') : ''
}

// Module-level pure fetch — no setState calls, so calling this inside a
// useEffect body does not trigger react-hooks/set-state-in-effect.
async function fetchLogData(
  p: number,
  filters: FilterState,
  auditOnly: boolean,
): Promise<LogsResponse> {
  const qs = new URLSearchParams({ page: String(p), limit: '50' })
  if (filters.actorEmail) qs.set('actorEmail', filters.actorEmail)
  if (!auditOnly && filters.action) qs.set('action', filters.action)
  if (filters.department) qs.set('department', filters.department)
  if (filters.dateFrom) qs.set('dateFrom', filters.dateFrom)
  if (filters.dateTo) qs.set('dateTo', filters.dateTo)
  if (auditOnly) qs.set('auditOnly', 'true')

  const res = await fetch(`/api/logs?${qs.toString()}`)
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Error ${res.status}`)
  }
  return res.json() as Promise<LogsResponse>
}

const inputClass =
  'bg-brand-bg border border-brand-border rounded text-xs text-white/80 px-2 py-1.5 focus:border-cyan outline-none placeholder:text-white/30 w-full'
const selectClass =
  'bg-brand-bg border border-brand-border rounded text-xs text-white/80 px-2 py-1.5 focus:border-cyan outline-none w-full'

export default function LogsPage() {
  const [view, setView] = useState<ViewMode>('feed')

  // "Draft" inputs — not sent to the API until Apply is clicked.
  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTERS)
  // "Applied" filters — triggers a fetch via useEffect whenever they change.
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS)

  const [page, setPage] = useState(1)
  const [data, setData] = useState<LogsResponse | null>(null)
  // Start true so the initial render shows a loading state without needing
  // a synchronous setLoading call inside the effect.
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch fires whenever page, applied filters, or view mode changes.
  // All setState calls are in async callbacks (.then / .catch / .finally)
  // so no synchronous setState runs inside the effect body.
  useEffect(() => {
    let active = true
    fetchLogData(page, applied, view === 'audit')
      .then((result) => {
        if (!active) return
        setData(result)
        setError(null)
      })
      .catch((e: unknown) => {
        if (!active) return
        setError((e as Error).message ?? String(e))
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [page, applied, view])

  // Event handlers set setLoading(true) synchronously before updating
  // the state that triggers the effect — that way the loading indicator
  // appears immediately without a setState inside the effect body.
  function handleApply() {
    setLoading(true)
    setError(null)
    setApplied({ ...draft })
    setPage(1)
  }

  function handleClear() {
    setLoading(true)
    setError(null)
    setDraft(EMPTY_FILTERS)
    setApplied(EMPTY_FILTERS)
    setPage(1)
  }

  function switchView(v: ViewMode) {
    setLoading(true)
    setError(null)
    setView(v)
    setPage(1)
    if (v === 'audit') {
      setDraft((prev) => ({ ...prev, action: '' }))
      setApplied((prev) => ({ ...prev, action: '' }))
    }
  }

  function goToPage(delta: number) {
    setLoading(true)
    setPage((p) => p + delta)
  }

  const logs = data?.logs ?? []
  const totalPages = data?.pages ?? 0
  const total = data?.total ?? 0

  return (
    <div className="min-h-screen bg-brand-bg text-white p-6 space-y-5">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <ScrollText size={22} className="text-cyan shrink-0" />
        <div>
          <h1 className="font-mono text-sm font-semibold tracking-widest uppercase text-white">
            Activity Logs
          </h1>
          <p className="text-white/40 text-xs mt-0.5">Audit trail for all mutating actions</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-brand-border">
        <button
          onClick={() => switchView('feed')}
          className={`flex items-center gap-1.5 px-5 py-2.5 text-xs font-mono tracking-wider uppercase border-b-2 transition-colors ${
            view === 'feed'
              ? 'border-cyan text-cyan'
              : 'border-transparent text-white/40 hover:text-white/70'
          }`}
        >
          <ScrollText size={12} />
          Activity Feed
        </button>
        <button
          onClick={() => switchView('audit')}
          className={`flex items-center gap-1.5 px-5 py-2.5 text-xs font-mono tracking-wider uppercase border-b-2 transition-colors ${
            view === 'audit'
              ? 'border-amber text-amber'
              : 'border-transparent text-white/40 hover:text-white/70'
          }`}
        >
          <Shield size={12} />
          Audit Log
        </button>
      </div>

      {/* Audit mode notice */}
      {view === 'audit' && (
        <div className="bg-amber/5 border border-amber/20 rounded px-4 py-2 text-xs text-amber/80 leading-relaxed">
          <span className="font-semibold text-amber">Audit preset active —</span>{' '}
          showing security-sensitive actions only:{' '}
          <span className="font-mono">{AUDIT_ACTIONS.join(' · ')}</span>
        </div>
      )}

      {/* Filter bar */}
      <Card>
        <CardHeader
          title="Filters"
          actions={
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={handleClear} icon={<X size={12} />}>
                Clear
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={handleApply}
                icon={<Search size={12} />}
              >
                Apply
              </Button>
            </div>
          }
        />
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <div>
            <label className="text-white/40 text-xs mb-1 block">Actor email</label>
            <input
              type="text"
              value={draft.actorEmail}
              onChange={(e) => setDraft((d) => ({ ...d, actorEmail: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && handleApply()}
              placeholder="user@example.com"
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-white/40 text-xs mb-1 block">
              Action{view === 'audit' && <span className="ml-1 text-amber/60">(preset)</span>}
            </label>
            <input
              type="text"
              value={draft.action}
              onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && handleApply()}
              placeholder="architecture.create"
              disabled={view === 'audit'}
              className={`${inputClass} ${view === 'audit' ? 'opacity-30 cursor-not-allowed' : ''}`}
            />
          </div>
          <div>
            <label className="text-white/40 text-xs mb-1 block">Department</label>
            <select
              value={draft.department}
              onChange={(e) => setDraft((d) => ({ ...d, department: e.target.value }))}
              className={selectClass}
            >
              <option value="">All departments</option>
              {DEPARTMENTS.map((dep) => (
                <option key={dep} value={dep}>
                  {dep.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-white/40 text-xs mb-1 block">From date</label>
            <input
              type="date"
              value={draft.dateFrom}
              onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-white/40 text-xs mb-1 block">To date</label>
            <input
              type="date"
              value={draft.dateTo}
              onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))}
              className={inputClass}
            />
          </div>
        </div>
      </Card>

      {/* Log list */}
      <Card noPad>
        <div className="px-4 py-3 border-b border-brand-border flex items-center justify-between">
          <span className="font-mono text-xs font-semibold tracking-widest text-white/60 uppercase">
            {loading ? 'Loading…' : `${total.toLocaleString()} event${total !== 1 ? 's' : ''}`}
          </span>
          {loading && <Loader2 size={14} className="animate-spin text-cyan" />}
        </div>

        {error && (
          <div className="px-4 py-3 text-xs text-crimson bg-crimson/5 border-b border-brand-border">
            {error}
          </div>
        )}

        {!error && !loading && logs.length === 0 && (
          <div className="px-4 py-16 text-center">
            <ScrollText size={28} className="mx-auto mb-3 text-white/15" />
            <p className="text-white/30 text-xs">No events match the current filters.</p>
          </div>
        )}

        {logs.length > 0 && (
          <div className="divide-y divide-brand-border">
            {logs.map((log) => (
              <div
                key={log.id}
                className="px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-white/25 text-[10px] font-mono shrink-0 w-[140px]">
                    {fmtDate(log.createdAt)}
                  </span>
                  <span className="text-white/70 text-xs font-medium truncate max-w-[200px]">
                    {log.actorEmail}
                  </span>
                  <span className={`font-mono text-xs font-semibold ${actionColor(log.action)}`}>
                    {log.action}
                  </span>
                  {log.targetType && (
                    <span className="text-white/30 text-xs">→ {log.targetType}</span>
                  )}
                  {log.targetId && (
                    <span
                      className="text-white/20 text-[10px] font-mono truncate max-w-[100px]"
                      title={log.targetId}
                    >
                      {log.targetId}
                    </span>
                  )}
                  {log.department && (
                    <span className="bg-white/5 border border-white/10 rounded-full px-2 py-0.5 text-[9px] text-white/35 uppercase tracking-wider shrink-0">
                      {deptLabel(log.department)}
                    </span>
                  )}
                </div>
                {log.metadata !== null && log.metadata !== undefined && (
                  <div className="mt-0.5 ml-[148px] text-[10px] text-white/20 font-mono truncate">
                    {JSON.stringify(log.metadata)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-brand-border flex items-center justify-between">
            <span className="text-white/30 text-xs">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={page <= 1 || loading}
                onClick={() => goToPage(-1)}
                icon={<ChevronLeft size={12} />}
              >
                Prev
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={page >= totalPages || loading}
                onClick={() => goToPage(1)}
              >
                Next
                <ChevronRight size={12} />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
