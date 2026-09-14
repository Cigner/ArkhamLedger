'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'

/**
 * Section navigation inside the administration area.
 *
 * Operations first: somebody who opens this area is more often checking whether
 * something is broken than creating an account, and accounts are created a few
 * times a year.
 */
const TABS = [
  { href: '/admin', label: 'Operations' },
  { href: '/admin/users', label: 'Users' },
]

export function AdminTabs() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center gap-1 border-b border-border-subtle">
      {TABS.map((tab) => {
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
