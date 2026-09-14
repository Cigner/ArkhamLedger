import type { Metadata } from 'next'
import { guardPage } from '@/lib/page-guards'
import { getCampaignDetail, getCampaignSettings } from '@/modules/campaigns/data/campaigns'
import { listMembers } from '@/modules/campaigns/data/members'
import { CampaignSettingsForm } from '@/modules/campaigns/ui/campaign-settings-form'
import { getDiscordStatus } from '@/modules/notifications/data/integrations'
import { DiscordCard } from '@/modules/notifications/ui/discord-card'

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

  const [settings, detail, members, discord] = await guardPage(() =>
    Promise.all([
      getCampaignSettings(campaignId),
      getCampaignDetail(campaignId),
      listMembers(campaignId),
      getDiscordStatus(campaignId),
    ]),
  )

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <CampaignSettingsForm settings={settings} members={members} viewer={detail.viewer} />
      {/* Owner only: a webhook posts to a room, so it is not a Keeper's call. */}
      {detail.viewer.isOwner ? <DiscordCard campaignId={campaignId} status={discord} /> : null}
    </div>
  )
}
