// src/components/layout/Sidebar.tsx
//
// Left-hand nav for the active group's own pages — replaces the old
// horizontal sub-nav bar that used to sit stacked under the Header (the
// primary group tabs stay in Header.tsx; only "which page within this
// group" moved here, so there's one header row instead of two).
'use client'

import Link from 'next/link'
import { useNavGroups, findActiveItem } from '@/lib/nav/useNavGroups'

export function Sidebar() {
  const { pathname, activeGroup } = useNavGroups()

  return (
    // No explicit height here on purpose — the parent row's ancestor chain
    // only sets min-h-screen (not h-screen), so a percentage height like
    // h-full can't resolve against it and the sidebar collapses to its own
    // content height instead of matching the page. Leaving height unset
    // lets the flex row's default align-items: stretch size it to match
    // `main` exactly, however tall the page's own content makes that row.
    <aside className="flex flex-col w-52 shrink-0 self-stretch bg-brand-surface-2 border-r border-brand-border overflow-y-auto">
      <p className="font-mono text-[9.5px] text-cyan uppercase tracking-widest px-4 pt-4 pb-2">
        {activeGroup.label}
      </p>
      <nav className="flex flex-col gap-0.5 px-2.5 pb-4">
        {activeGroup.items.map((item) => {
          const isActive = item.href === findActiveItem(pathname, activeGroup.items)?.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex items-center gap-2 pl-3 pr-2.5 py-2 rounded-md font-mono text-[11px] uppercase tracking-wider transition-colors ${
                isActive
                  ? 'bg-cyan/10 text-cyan font-bold'
                  : 'text-white/50 hover:text-white hover:bg-brand-surface-3'
              }`}
            >
              {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-cyan" />}
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
