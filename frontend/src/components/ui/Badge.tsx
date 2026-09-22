// src/components/ui/Badge.tsx
'use client'

import type { BadgeVariant } from '@/types/common'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  size?: 'sm' | 'md'
  dot?: boolean
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  critical: 'bg-crimson/20 text-crimson border border-crimson/40',
  warning: 'bg-amber/20 text-amber border border-amber/40',
  healthy: 'bg-emerald/20 text-emerald border border-emerald/40',
  info: 'bg-cyan/20 text-cyan border border-cyan/40',
  neutral: 'bg-brand-surface text-white/50 border border-brand-border',
}

const dotColors: Record<BadgeVariant, string> = {
  critical: 'bg-crimson',
  warning: 'bg-amber',
  healthy: 'bg-emerald',
  info: 'bg-cyan',
  neutral: 'bg-white/40',
}

export function Badge({ variant = 'neutral', children, size = 'md', dot, className = '' }: BadgeProps) {
  const sizeClass = size === 'sm' ? 'text-[10px] px-1.5 py-0.5 gap-1' : 'text-xs px-2 py-0.5 gap-1.5'

  return (
    <span
      className={`inline-flex items-center font-mono uppercase tracking-wider rounded ${variantStyles[variant]} ${sizeClass} ${className}`}
    >
      {dot && (
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${dotColors[variant]} animate-pulse-slow shrink-0`}
        />
      )}
      {children}
    </span>
  )
}
