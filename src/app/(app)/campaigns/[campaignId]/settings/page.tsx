import type { Metadata } from 'next'
import { getCampaignDetail, getCampaignSettings } from '@/modules/campaigns/data/campaigns'
import { listMembers } from '@/modules/campaigns/data/members'
import { CampaignSettingsForm } from '@/modules/campaigns/ui/campaign-settings-form'

/**
 * Campaign settings.
 *
 * getCampaignSettings requires a Keeper, so an Investigator who navigates here
 * directly is refused by the query rather than by the missing tab.
 */
export const metadata: Metadata = { title: 'Settings' }
export const dynamic = 'force-dynamic'

export default async function CampaignSettingsPage({
  params,
}: {
  params: Promise<{ campaignId: string }>
}) {
  const { campaignId } = await params

  const [settings, detail, members] = await Promise.all([
    getCampaignSettings(campaignId),
    getCampaignDetail(campaignId),
    listMembers(campaignId),
  ])

  return <CampaignSettingsForm settings={settings} members={members} viewer={detail.viewer} />
}
