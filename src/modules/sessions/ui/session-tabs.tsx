'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'

/**
 * Section navigation inside a session.
 *
 * The participants tab is Keeper-only because it shows priorities, which are the
 * Keeper's private working notes. The route enforces that itself.
 */
export function SessionTabs({ sessionId, isKeeper }: { sessionId: string; isKeeper: boolean }) {
  const pathname = usePathname()
  const base = `/sessions/${sessionId}`

  const tabs = [
    { href: base, label: 'Overview' },
    ...(isKeeper ? [{ href: `${base}/participants`, label: 'Participants' }] : []),
  ]

  return (
    <nav className="flex items-center gap-1 border-b border-border-subtle">
      {tabs.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 font-ui text-sm transition-interactive',
              active
                ? 'border-candle-9 font-medium text-text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
