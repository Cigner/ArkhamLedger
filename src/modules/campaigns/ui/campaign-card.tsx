import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { CampaignListItem } from '../domain/types'
import { CampaignRoleBadge, CampaignStatusBadge } from './campaign-status-badge'

/**
 * Campaign summary on the list screen.
 *
 * Leads with the viewer's own role, because the first thing somebody opening
 * this screen needs to know is which of these they are running and which they
 * are playing in.
 */
export function CampaignCard({ campaign }: { campaign: CampaignListItem }) {
  return (
    <Card
      ornamented={campaign.role === 'KEEPER'}
      className="transition-interactive hover:border-border-default"
    >
      <CardHeader className="gap-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle>
            <Link href={`/campaigns/${campaign.id}`} className="hover:underline">
              {campaign.name}
            </Link>
          </CardTitle>
          <CampaignStatusBadge status={campaign.status} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CampaignRoleBadge role={campaign.role} />
          {campaign.isOwner ? (
            <span className="font-ui text-2xs uppercase tracking-[--tracking-smallcaps] text-text-muted">
              Owner
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3 font-ui text-sm text-text-secondary">
        <span>
          {campaign.memberCount} {campaign.memberCount === 1 ? 'member' : 'members'}
        </span>
        {campaign.scenarioName ? (
          <span className="truncate text-text-muted">{campaign.scenarioName}</span>
        ) : null}
      </CardContent>
    </Card>
  )
}
