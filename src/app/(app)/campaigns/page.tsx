import { Library, Plus } from 'lucide-react'
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
        icon={<Library className="size-6" strokeWidth={1.5} />}
        actions={
          <ButtonLink variant="accent" href="/campaigns/new">
            <Plus className="size-4" aria-hidden="true" />
            New campaign
          </ButtonLink>
        }
      />

      {campaigns.length === 0 ? (
        <EmptyState
          title="The archive is empty"
          icon={<Library className="size-8" strokeWidth={1.25} />}
          description="Create a campaign, or wait for a Keeper to invite you."
          action={
            <ButtonLink variant="accent" href="/campaigns/new">
              <Plus className="size-4" aria-hidden="true" />
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
