'use client'

import { Activity, MessageSquareWarning, ScrollText, UserRoundCog, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'

/**
 * Section navigation inside the administration area.
 *
 * Operations first: somebody who opens this area is more often checking whether
 * something is broken than creating an account, and accounts are created a few
 * times a year.
 */
export function AdminTabs() {
  const pathname = usePathname()
  const t = useTranslations('admin.tabs')
  const tabs = [
    { href: '/admin', label: t('operations'), icon: Activity },
    { href: '/admin/users', label: t('users'), icon: Users },
    { href: '/admin/reports', label: t('reports'), icon: MessageSquareWarning },
    { href: '/admin/characters', label: t('characters'), icon: UserRoundCog },
    { href: '/admin/rulesets', label: t('rulesets'), icon: ScrollText },
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
