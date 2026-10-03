// src/components/ui/Card.tsx
'use client'

import type { ReactNode, HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  glow?: 'cyan' | 'amber' | 'crimson' | 'emerald' | 'none'
  noPad?: boolean
}

const glowStyles = {
  none: '',
  cyan: 'hover:border-cyan/40 hover:shadow-cyan-glow',
  amber: 'hover:border-amber/40 hover:shadow-amber-glow',
  crimson: 'border-crimson/30 shadow-crimson-glow',
  emerald: 'hover:border-emerald/40 hover:shadow-emerald-glow',
}

export function Card({ children, glow = 'none', noPad, className = '', ...props }: CardProps) {
  return (
    <div
      className={`
        bg-brand-surface border border-brand-border rounded transition-all duration-200
        ${glowStyles[glow]}
        ${noPad ? '' : 'p-4'}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  className?: string
}

export function CardHeader({ title, subtitle, actions, className = '' }: CardHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-2 ${className}`}>
      <div>
        <h3 className="font-mono text-xs font-semibold tracking-widest text-white/75 uppercase">{title}</h3>
        {subtitle && <p className="text-white/62 text-xs mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
