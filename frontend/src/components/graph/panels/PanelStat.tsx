// src/components/graph/panels/PanelStat.tsx
// Shared stat tile for the type-specific panels — keeps all 8 panels visually consistent.
import type { LucideIcon } from 'lucide-react'

export function PanelStat({ icon: Icon, label, value, accent }: { icon: LucideIcon; label: string; value: string; accent?: string }) {
  return (
    <div className="bg-brand-bg border border-brand-border rounded p-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={11} className="text-white/62" />
        <span className="font-mono text-[10px] text-white/62 uppercase">{label}</span>
      </div>
      <p className="font-mono text-xs truncate" style={{ color: accent ?? 'var(--color-white)' }}>{value}</p>
    </div>
  )
}

export function PanelGauge({ label, value, unit = '%' }: { label: string; value: number; unit?: string }) {
  const color = value >= 90 ? '#B23A2E' : value >= 70 ? '#B8720F' : '#1F9E6D'
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[10px] text-white/70 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-brand-border rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }} />
      </div>
      <span className="font-mono text-[10px] text-white/70 w-10 text-right">{value}{unit}</span>
    </div>
  )
}

export function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-[10px] text-white/62 uppercase tracking-widest">{title}</p>
      {children}
    </div>
  )
}
