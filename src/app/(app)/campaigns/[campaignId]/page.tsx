import { ScrollText, Users } from 'lucide-react'
import type { Metadata } from 'next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getCampaignDetail } from '@/modules/campaigns/data/campaigns'
import { listMembers } from '@/modules/campaigns/data/members'
import { CampaignRoleBadge } from '@/modules/campaigns/ui/campaign-status-badge'
import { getCampaignDiary } from '@/modules/sessions/data/sessions'
import { NextSessionCard } from '@/modules/sessions/ui/next-session-card'

/**
 * Campaign overview.
 *
 * Built around one question — when are we next playing — because the answer
 * "nobody has arranged anything" is the one that decides whether a campaign
 * survives. Everything else on this page is context for it.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ campaignId: string }>
}): Promise<Metadata> {
  const { campaignId } = await params
  const campaign = await getCampaignDetail(campaignId)
  return { title: campaign.name }
}

export default async function CampaignOverviewPage({
  params,
}: {
  params: Promise<{ campaignId: string }>
}) {
  const { campaignId } = await params
  const [campaign, members, diary] = await Promise.all([
    getCampaignDetail(campaignId),
    listMembers(campaignId),
    getCampaignDiary(campaignId),
  ])

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <NextSessionCard
          diary={diary}
          campaignId={campaignId}
          isKeeper={campaign.viewer.role === 'KEEPER'}
        />
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4 text-text-muted" aria-hidden="true" />
              The party
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {members.map((member) => (
                <li key={member.userId} className="flex items-center justify-between gap-3">
                  <span className="font-ui text-sm text-text-primary">
                    {member.name}
                    {member.isOwner ? (
                      <span className="ml-2 text-2xs uppercase tracking-[--tracking-smallcaps] text-text-muted">
                        Owner
                      </span>
                    ) : null}
                  </span>
                  <CampaignRoleBadge role={member.role} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {campaign.scenario ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ScrollText className="size-4 text-text-muted" aria-hidden="true" />
                Scenario
              </CardTitle>
            </CardHeader>
            <CardContent className="font-ui text-sm text-text-secondary">
              {campaign.scenario.name}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
