/**
 * Campaign data transfer objects.
 *
 * Shaped per use case rather than per table. The list card and the settings form
 * need different fields, and giving each its own type is what stops a query
 * written for one screen from quietly leaking extra columns into another.
 */
export type CampaignRole = 'KEEPER' | 'INVESTIGATOR'
export type MembershipStatus = 'ACTIVE' | 'LEFT' | 'REMOVED'
export type CampaignStatus = 'PLANNING' | 'ACTIVE' | 'ON_HIATUS' | 'COMPLETED' | 'ARCHIVED'

/** The caller's standing in a campaign, resolved once per request by the guards. */
export type Membership = {
  readonly campaignId: string
  readonly userId: string
  readonly role: CampaignRole
  readonly isOwner: boolean
}

export type CampaignListItem = {
  readonly id: string
  readonly name: string
  readonly status: CampaignStatus
  readonly role: CampaignRole
  readonly isOwner: boolean
  readonly memberCount: number
  readonly scenarioName: string | null
}

export type CampaignDetail = {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly status: CampaignStatus
  readonly timezone: string
  readonly ownerId: string
  readonly ownerName: string
  readonly scenario: { readonly id: string; readonly name: string } | null
  readonly createdAt: Date
  readonly viewer: Membership
}

export type CampaignSettings = {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly status: CampaignStatus
  readonly timezone: string
  readonly defaultMinSessionHours: number
  readonly defaultQuorumMode: 'HALF_PLUS_ONE' | 'ALL' | 'CUSTOM'
  readonly defaultQuorumValue: number | null
  readonly scenarioId: string | null
}

export type CampaignMemberListItem = {
  readonly userId: string
  readonly name: string
  readonly email: string
  readonly role: CampaignRole
  readonly isOwner: boolean
  readonly joinedAt: Date
}

export type InvitationListItem = {
  readonly id: string
  readonly targetUserName: string | null
  readonly roleOnJoin: CampaignRole
  readonly maxUses: number
  readonly usedCount: number
  readonly expiresAt: Date
  readonly createdAt: Date
}

/** Why an invitation cannot be accepted; drives the screen the visitor sees. */
export type InvitationRejection = 'INVALID' | 'EXPIRED' | 'REVOKED' | 'EXHAUSTED' | 'NOT_FOR_YOU'

export type InvitationPreview =
  | {
      readonly ok: true
      readonly campaignId: string
      readonly campaignName: string
      readonly keeperNames: readonly string[]
      readonly memberCount: number
      readonly roleOnJoin: CampaignRole
      /** True when the visitor is already an active member; the screen says so rather than erroring. */
      readonly alreadyMember: boolean
    }
  | { readonly ok: false; readonly reason: InvitationRejection }
