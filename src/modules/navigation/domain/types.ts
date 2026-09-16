import type { CampaignStatus } from '@/modules/campaigns/domain/types'
import type { SessionStatus } from '@/modules/sessions/domain/types'

export type CampaignShortcut = {
  readonly id: string
  readonly name: string
  readonly status: CampaignStatus
  readonly activity: 'UPCOMING' | 'ARRANGING' | 'RECENT' | 'CAMPAIGN'
  readonly activityAt: string
}

export type SessionShortcut = {
  readonly id: string
  readonly campaignId: string
  readonly campaignName: string
  readonly title: string
  readonly status: SessionStatus
  readonly confirmedStartUtc: string | null
  readonly availabilityDeadline: string | null
  readonly updatedAt: string
}

export type SidebarNavigation = {
  readonly campaigns: readonly CampaignShortcut[]
  readonly sessions: readonly SessionShortcut[]
}
