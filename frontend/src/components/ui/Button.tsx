// src/components/ui/Button.tsx
'use client'

import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { ButtonVariant } from '@/types/common'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
  children?: ReactNode
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-cyan text-brand-bg font-semibold hover:bg-cyan/90 shadow-cyan-glow hover:shadow-[0_0_30px_rgba(31, 158, 109,0.5)] active:scale-95',
  secondary:
    'bg-brand-surface border border-brand-border text-white/80 hover:border-white/30 hover:text-white hover:bg-brand-surface-2 active:scale-95',
  ghost:
    'bg-transparent text-white/75 hover:text-white hover:bg-white/5 active:scale-95',
  danger:
    'bg-crimson/20 border border-crimson/40 text-crimson hover:bg-crimson/30 hover:border-crimson active:scale-95',
}

const sizeStyles = {
  sm: 'text-xs px-3 py-1.5 gap-1.5',
  md: 'text-sm px-4 py-2 gap-2',
  lg: 'text-sm px-5 py-2.5 gap-2',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  children,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center font-sans rounded transition-all duration-150
        ${variantStyles[variant]} ${sizeStyles[size]}
        disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none
        ${className}
      `}
      {...props}
    >
      {loading ? (
        <Loader2 className="animate-spin shrink-0" size={14} />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      {children}
    </button>
  )
}
