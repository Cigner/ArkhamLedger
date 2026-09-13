'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'

/**
 * Section navigation inside a campaign.
 *
 * Rendered as links rather than a tab widget so each section is a real URL that
 * can be bookmarked, shared and reloaded. Sections the viewer cannot reach are
 * omitted; the routes enforce that themselves.
 */
export function CampaignTabs({ campaignId, isKeeper }: { campaignId: string; isKeeper: boolean }) {
  const pathname = usePathname()
  const base = `/campaigns/${campaignId}`

  const tabs = [
    { href: base, label: 'Overview' },
    { href: `${base}/members`, label: 'Members' },
    ...(isKeeper ? [{ href: `${base}/settings`, label: 'Settings' }] : []),
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
