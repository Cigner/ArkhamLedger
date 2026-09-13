import type { Metadata } from 'next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/patterns/empty-state'
import { getCampaignDetail } from '@/modules/campaigns/data/campaigns'
import { listMembers } from '@/modules/campaigns/data/members'
import { CampaignRoleBadge } from '@/modules/campaigns/ui/campaign-status-badge'

/**
 * Campaign overview.
 *
 * Placeholder for the next session card until the sessions module lands; the
 * roster and scenario are already real.
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
  const [campaign, members] = await Promise.all([
    getCampaignDetail(campaignId),
    listMembers(campaignId),
  ])

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <EmptyState
          title="No session is scheduled"
          description="Session planning arrives in the next phase."
        />
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>The party</CardTitle>
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
              <CardTitle>Scenario</CardTitle>
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
