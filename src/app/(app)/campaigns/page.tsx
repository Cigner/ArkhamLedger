import type { Metadata } from 'next'
import { ButtonLink } from '@/components/ui/button-link'
import { EmptyState } from '@/components/patterns/empty-state'
import { PageHeader } from '@/components/patterns/page-header'
import { listMyCampaigns } from '@/modules/campaigns/data/campaigns'
import { CampaignCard } from '@/modules/campaigns/ui/campaign-card'

/**
 * Campaign list.
 *
 * Scoped by membership in the query itself, so a campaign the viewer does not
 * belong to never enters the result set.
 */
export const metadata: Metadata = { title: 'Campaigns' }
export const dynamic = 'force-dynamic'

export default async function CampaignsPage() {
  const campaigns = await listMyCampaigns()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Campaigns"
        description="Every campaign you keep or investigate."
        actions={
          <ButtonLink variant="accent" href="/campaigns/new">
            New campaign
          </ButtonLink>
        }
      />

      {campaigns.length === 0 ? (
        <EmptyState
          title="The archive is empty"
          description="Create a campaign, or wait for a Keeper to send you an invitation."
          action={
            <ButtonLink variant="accent" href="/campaigns/new">
              Create campaign
            </ButtonLink>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <CampaignCard campaign={campaign} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
