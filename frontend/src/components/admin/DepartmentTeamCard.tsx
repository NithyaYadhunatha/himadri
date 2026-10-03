// src/components/admin/DepartmentTeamCard.tsx
//
// Pure display card for the Team page's "Department Overview" section —
// renders one department's roster from src/lib/mockData/mockTeamDirectory.ts
// (hardcoded demo data, no fetch, no API). Clicking the department header
// collapses/expands its whole roster; clicking a member row within an open
// roster expands an inline detail drawer for that person.
'use client'

import { useState } from 'react'
import { ChevronDown, Shield, Mail, Phone, MapPin, CalendarDays, BadgeCheck, Building2, X } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { MockDepartment } from '@/lib/mockData/mockTeamDirectory'

export function DepartmentTeamCard({ department }: { department: MockDepartment }) {
  const [open, setOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [members, setMembers] = useState(department.members)

  const removeMember = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id))
    setExpandedId((cur) => (cur === id ? null : cur))
  }

  return (
    <Card noPad>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-cyan/10 border border-cyan/30 flex items-center justify-center shrink-0">
            <Building2 size={15} className="text-cyan" />
          </div>
          <CardHeader
            title={department.name}
            subtitle={`${department.description} · ${members.length} member(s)`}
          />
        </div>
        <ChevronDown size={16} className={`text-white/62 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
      <div className="divide-y divide-brand-border border-t border-brand-border">
        {members.length === 0 && (
          <div className="px-4 py-6 text-center text-white/62 text-sm">No members left in this department.</div>
        )}
        {members.map((member) => {
          const expanded = expandedId === member.id
          return (
            <div key={member.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setExpandedId(expanded ? null : member.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setExpandedId(expanded ? null : member.id)
                  }
                }}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-cyan/10 border border-cyan/30 flex items-center justify-center shrink-0 font-mono text-[11px] text-cyan">
                    {member.name
                      .split(' ')
                      .map((p) => p[0])
                      .join('')}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm text-white/85 truncate">{member.name}</p>
                      {member.isDepartmentAdmin && (
                        <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-amber bg-amber/10 border border-amber/30 rounded px-1.5 py-0.5 shrink-0">
                          <Shield size={9} />
                          Dept Admin
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/62 truncate">{member.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<X size={12} />}
                    onClick={(e) => {
                      e.stopPropagation()
                      removeMember(member.id)
                    }}
                  >
                    Remove
                  </Button>
                  <ChevronDown
                    size={14}
                    className={`text-white/55 transition-transform ${expanded ? 'rotate-180' : ''}`}
                  />
                </div>
              </div>
              {expanded && (
                <div className="px-4 pb-4 pl-[52px] grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                  <DetailRow icon={<BadgeCheck size={12} />} label="Role" value={member.role} />
                  <DetailRow icon={<Mail size={12} />} label="Email" value={member.email} />
                  <DetailRow icon={<Phone size={12} />} label="Phone" value={member.phone} />
                  <DetailRow icon={<MapPin size={12} />} label="Location" value={member.location} />
                  <DetailRow icon={<CalendarDays size={12} />} label="Joined" value={member.joinedOn} />
                </div>
              )}
            </div>
          )
        })}
      </div>
      )}
    </Card>
  )
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-white/55">{icon}</span>
      <span className="text-white/62 w-14 shrink-0">{label}</span>
      <span className="text-white/70">{value}</span>
    </div>
  )
}
