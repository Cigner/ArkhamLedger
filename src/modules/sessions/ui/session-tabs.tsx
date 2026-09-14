'use client'

import { CalendarClock, CalendarSearch, FileText, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'

/**
 * Section navigation inside a session.
 *
 * The dates and participants tabs are Keeper-only: one ranks windows against
 * named availability, the other shows priorities, and both are the Keeper's
 * private working notes. The routes enforce that themselves.
 */
export function SessionTabs({
  sessionId,
  isKeeper,
  isParticipant,
}: {
  sessionId: string
  isKeeper: boolean
  isParticipant: boolean
}) {
  const pathname = usePathname()
  const base = `/sessions/${sessionId}`

  const tabs = [
    { href: base, label: 'Overview', icon: FileText },
    // Only somebody who was invited has an answer to give or a grid to read.
    ...(isParticipant
      ? [{ href: `${base}/availability`, label: 'Availability', icon: CalendarClock }]
      : []),
    ...(isKeeper ? [{ href: `${base}/scheduling`, label: 'Dates', icon: CalendarSearch }] : []),
    ...(isKeeper ? [{ href: `${base}/participants`, label: 'Participants', icon: Users }] : []),
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
              '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 font-ui text-sm transition-interactive',
              active
                ? 'border-candle-9 font-medium text-text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            <tab.icon className="size-4" aria-hidden="true" />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
