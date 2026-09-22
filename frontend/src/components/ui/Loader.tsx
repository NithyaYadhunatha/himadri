// src/components/ui/Loader.tsx
'use client'

interface SkeletonProps {
  className?: string
  rows?: number
  height?: string
}

export function Skeleton({ className = '', height = 'h-4' }: SkeletonProps) {
  return (
    <div
      className={`rounded bg-gradient-to-r from-brand-surface via-brand-surface-3 to-brand-surface
        bg-[length:200%_100%] animate-shimmer ${height} ${className}`}
    />
  )
}

export function CardSkeleton() {
  return (
    <div className="bg-brand-surface border border-brand-border rounded p-4 space-y-3 animate-pulse-slow">
      <Skeleton height="h-3" className="w-1/3" />
      <Skeleton height="h-8" className="w-1/2" />
      <Skeleton height="h-3" className="w-full" />
      <Skeleton height="h-3" className="w-4/5" />
    </div>
  )
}

export function NodeCardSkeleton() {
  return (
    <div className="bg-brand-surface border border-brand-border rounded p-4 space-y-4 animate-pulse-slow">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded bg-brand-surface-3" />
        <div className="flex-1 space-y-2">
          <Skeleton height="h-4" className="w-3/4" />
          <Skeleton height="h-3" className="w-1/2" />
        </div>
      </div>
      <div className="w-20 h-20 rounded-full bg-brand-surface-3 mx-auto" />
      <Skeleton height="h-2" />
      <Skeleton height="h-8" className="w-full" />
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 items-center py-3 border-b border-brand-border animate-pulse-slow">
          <Skeleton height="h-4" className="w-32" />
          <Skeleton height="h-4" className="w-24" />
          <Skeleton height="h-4" className="flex-1" />
          <Skeleton height="h-6" className="w-16" />
        </div>
      ))}
    </div>
  )
}

interface InlineLoaderProps {
  text?: string
}

export function InlineLoader({ text = 'Loading...' }: InlineLoaderProps) {
  return (
    <div className="flex items-center gap-2 text-white/40 text-sm">
      <div className="w-4 h-4 border border-cyan/40 border-t-cyan rounded-full animate-spin" />
      <span className="font-mono text-xs">{text}</span>
    </div>
  )
}

interface ErrorStateProps {
  message: string
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
      <div className="w-10 h-10 rounded-full bg-crimson/10 border border-crimson/30 flex items-center justify-center">
        <span className="text-crimson text-lg">!</span>
      </div>
      <p className="text-white/50 text-sm">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-cyan text-xs font-mono hover:underline mt-1"
        >
          Retry
        </button>
      )}
    </div>
  )
}

export function EmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
      <div className="w-10 h-10 rounded-full bg-brand-surface-3 border border-brand-border flex items-center justify-center">
        <span className="text-white/30 text-sm">—</span>
      </div>
      <p className="text-white/50 text-sm">{message}</p>
      {hint && <p className="text-white/30 text-xs">{hint}</p>}
    </div>
  )
}
