'use client'

import { CalendarDays, FileText, ScrollText, Settings2, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('campaigns.tabs')
  const base = `/campaigns/${campaignId}`

  const tabs = [
    { href: base, label: t('overview'), icon: FileText },
    { href: `${base}/sessions`, label: t('sessions'), icon: CalendarDays },
    { href: `${base}/investigators`, label: t('investigators'), icon: ScrollText },
    { href: `${base}/members`, label: t('members'), icon: Users },
    ...(isKeeper ? [{ href: `${base}/settings`, label: t('settings'), icon: Settings2 }] : []),
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
