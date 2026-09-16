import { BookOpen, ScrollText, Users } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { CampaignListItem } from '../domain/types'
import { CampaignRoleBadge, CampaignStatusBadge } from './campaign-status-badge'

/**
 * Campaign summary on the list screen.
 *
 * Leads with the viewer's own role, because the first thing somebody opening
 * this screen needs to know is which of these they are running and which they
 * are playing in.
 *
 * The whole card is the link. It used to be the title alone, which meant
 * pointing at a card the size of a postcard and finding that only three words
 * of it responded - there is nothing else to click here, so the target is the
 * card.
 */
export function CampaignCard({ campaign }: { campaign: CampaignListItem }) {
  const t = useTranslations('campaigns.card')

  return (
    <Link
      href={`/campaigns/${campaign.id}`}
      // Named explicitly: without it the accessible name is the whole card read
      // out as one run-on sentence, badges and counts included.
      aria-label={t('accessibleLabel', {
        name: campaign.name,
        role: campaign.role === 'KEEPER' ? t('keeper') : t('investigator'),
      })}
      className="group block rounded-lg focus-visible:outline-none"
    >
      <Card
        ornamented={campaign.role === 'KEEPER'}
        className="h-full transition-interactive group-hover:border-border-strong group-focus-visible:border-focus-ring group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-focus-ring"
      >
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="group-hover:underline">{campaign.name}</CardTitle>
            <CampaignStatusBadge status={campaign.status} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CampaignRoleBadge role={campaign.role} />
            {campaign.isOwner ? (
              <span className="inline-flex items-center gap-1 font-ui text-2xs uppercase tracking-[--tracking-smallcaps] text-text-muted">
                <BookOpen className="size-3" aria-hidden="true" />
                {t('owner')}
              </span>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="flex items-center justify-between gap-3 font-ui text-sm text-text-secondary">
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-4 text-text-muted" aria-hidden="true" />
            <span data-tabular>{campaign.memberCount}</span>
          </span>
          {campaign.scenarioName ? (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-text-muted">
              <ScrollText className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{campaign.scenarioName}</span>
            </span>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  )
}
