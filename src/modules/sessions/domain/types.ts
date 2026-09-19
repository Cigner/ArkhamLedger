/**
 * Session data transfer objects.
 */
export type SessionStatus =
  'DRAFT' | 'COLLECTING' | 'PROPOSED' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

export type ParticipantPriority = 'REQUIRED' | 'PREFERRED' | 'OPTIONAL'
export type Attendance = 'UNKNOWN' | 'ATTENDED' | 'ABSENT'

export type SessionListItem = {
  readonly id: string
  readonly title: string
  readonly status: SessionStatus
  readonly searchWindowStart: string
  readonly searchWindowEnd: string
  readonly availabilityDeadline: Date | null
  readonly confirmedStartUtc: Date | null
  readonly confirmedEndUtc: Date | null
  readonly timezone: string
  readonly participantCount: number
  readonly respondedCount: number
  /** The viewer's own participation, absent when they were not invited. */
  readonly viewerIsParticipant: boolean
  readonly viewerHasResponded: boolean
}

export type SessionParticipantDto = {
  readonly userId: string
  readonly name: string
  readonly priority: ParticipantPriority
  readonly isKeeper: boolean
  readonly playsInvestigator: boolean
  readonly respondedAt: Date | null
  readonly attendance: Attendance
}

export type SessionDetail = {
  readonly id: string
  readonly campaignId: string
  readonly campaignName: string
  readonly title: string
  readonly description: string | null
  readonly status: SessionStatus
  readonly searchWindowStart: string
  readonly searchWindowEnd: string
  readonly gridStartHour: number
  readonly gridEndHour: number
  readonly minSessionHours: number
  readonly quorum: number
  readonly availabilityDeadline: Date | null
  readonly timezone: string
  readonly confirmedStartUtc: Date | null
  readonly confirmedEndUtc: Date | null
  readonly startedAt: Date | null
  readonly endedAt: Date | null
  readonly setManually: boolean
  readonly cancelledReason: string | null
  readonly participants: readonly SessionParticipantDto[]
  readonly viewer: {
    readonly userId: string
    readonly isKeeper: boolean
    readonly isParticipant: boolean
    /**
     * Priorities are never sent to an Investigator: being told you are
     * "optional" is a social injury the feature does not need to inflict.
     * They are told only whether their own presence is required.
     */
    readonly ownPresenceRequired: boolean
    readonly ownResponse: Date | null
  }
}

/** Aggregate response progress, safe to show to everyone. */
export type ResponseProgress = {
  readonly total: number
  readonly responded: number
  readonly pending: number
}

/** One line in a campaign's diary: enough to render a card, and nothing more. */
export type DiaryEntry = {
  readonly id: string
  readonly title: string
  readonly status: SessionStatus
  readonly confirmedStartUtc: Date | null
  readonly confirmedEndUtc: Date | null
  readonly availabilityDeadline: Date | null
  readonly searchWindowStart: string
  readonly searchWindowEnd: string
  readonly timezone: string
}

/**
 * What a campaign has coming.
 *
 * `next` is the invariant the dashboard exists to protect: a campaign with
 * nothing in it is not idle, it is quietly ending, and that is the one state
 * worth interrupting somebody about.
 */
export type CampaignDiary = {
  readonly next: DiaryEntry | null
  readonly arranging: readonly DiaryEntry[]
  readonly recent: readonly DiaryEntry[]
}
