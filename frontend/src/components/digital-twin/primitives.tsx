'use client'

import type { ReactNode } from 'react'
import type { Health, LinkState } from '@/lib/twin/types'

export function Dot({ s }: { s: Health }) {
  return <span className={`tw-dot ${s}`} aria-hidden />
}

const LABEL: Record<Health, string> = { normal: 'NORMAL', warning: 'WARNING', critical: 'CRITICAL', offline: 'OFFLINE' }
export function StatusPill({ s, label }: { s: Health; label?: string }) {
  return <span className={`tw-pill ${s}`}><Dot s={s} />{label ?? LABEL[s]}</span>
}

export function PanelHead({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="tw-ph"><h2>{title}</h2>{children}</div>
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="tw-field"><label>{label}</label>{children}</div>
}

export function Tabs<T extends string>({ value, onChange, items }: {
  value: T
  onChange: (v: T) => void
  items: { id: T; label: string; disabled?: boolean; title?: string }[]
}) {
  return (
    <div className="tw-tabs" role="tablist">
      {items.map((i) => (
        <button key={i.id} role="tab" aria-selected={value === i.id} disabled={i.disabled} title={i.title} onClick={() => onChange(i.id)}>
          {i.label}
        </button>
      ))}
    </div>
  )
}

export function Ring({ value, color }: { value: number; color: string }) {
  const r = 15, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, value))
  return (
    <svg className="tw-ring" viewBox="0 0 38 38" role="img" aria-label={`Health ${Math.round(v)}`}>
      <circle cx="19" cy="19" r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="4" />
      <circle cx="19" cy="19" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 19 19)" />
      <text x="19" y="22.5" textAnchor="middle" fontSize="10" fontWeight="700" fill="#E5E7EB">{Math.round(v)}</text>
    </svg>
  )
}

export const LINK_META: Record<LinkState, { label: string; tone: Health; text: string }> = {
  live: { label: 'LIVE', tone: 'normal', text: 'Receiving telemetry' },
  connecting: { label: 'CONNECTING', tone: 'warning', text: 'Connecting to backend…' },
  stale: { label: 'STALE', tone: 'warning', text: 'Data has stopped updating' },
  'gateway-offline': { label: 'GATEWAY OFFLINE', tone: 'critical', text: 'Backend is up, but no device is reporting (gateway / Arduino offline)' },
  'backend-offline': { label: 'OFFLINE', tone: 'critical', text: 'Backend unreachable' },
}
