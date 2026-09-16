import { Library, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
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
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('campaigns.list')
  return { title: t('title') }
}
export const dynamic = 'force-dynamic'

export default async function CampaignsPage() {
  const t = await getTranslations('campaigns.list')
  const campaigns = await listMyCampaigns()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t('title')}
        icon={<Library className="size-6" strokeWidth={1.5} />}
        actions={
          <ButtonLink variant="accent" href="/campaigns/new">
            <Plus className="size-4" aria-hidden="true" />
            {t('new')}
          </ButtonLink>
        }
      />

      {campaigns.length === 0 ? (
        <EmptyState
          title={t('emptyTitle')}
          icon={<Library className="size-8" strokeWidth={1.25} />}
          description={t('emptyDescription')}
          action={
            <ButtonLink variant="accent" href="/campaigns/new">
              <Plus className="size-4" aria-hidden="true" />
              {t('create')}
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
