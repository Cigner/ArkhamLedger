import { getCampaignDetail } from '@/modules/campaigns/data/campaigns'
import { PageHeader } from '@/components/patterns/page-header'
import { CampaignStatusBadge } from '@/modules/campaigns/ui/campaign-status-badge'
import { CampaignTabs } from '@/modules/campaigns/ui/campaign-tabs'

/**
 * Campaign shell.
 *
 * Loads the campaign once for the header and tabs. The query authorizes
 * membership itself and raises NOT FOUND for a non-member, so an outsider
 * cannot tell a campaign they are excluded from apart from one that does not
 * exist.
 */
export default async function CampaignLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ campaignId: string }>
}) {
  const { campaignId } = await params
  const campaign = await getCampaignDetail(campaignId)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={campaign.name}
        description={campaign.description}
        actions={<CampaignStatusBadge status={campaign.status} />}
      />
      <CampaignTabs campaignId={campaignId} isKeeper={campaign.viewer.role === 'KEEPER'} />
      {children}
    </div>
  )
}
