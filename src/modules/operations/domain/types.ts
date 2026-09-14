/**
 * What an administrator needs to know about a running deployment.
 *
 * Counts, not charts. At this size the useful questions are few and specific:
 * is the worker alive, is anything stuck in the queue, and is any campaign
 * drifting towards the quiet death this application exists to prevent. Anything
 * that would need a time series to answer is a question nobody here is asking.
 */
export type AccountMetrics = {
  readonly total: number
  readonly active: number
  readonly pendingActivation: number
  readonly disabled: number
}

export type CampaignMetrics = {
  readonly total: number
  readonly active: number
  /** Active campaigns with nothing scheduled and nothing being arranged. */
  readonly idle: number
}

export type SessionMetrics = {
  readonly collecting: number
  readonly proposed: number
  readonly scheduledAhead: number
  readonly overdueDeadlines: number
}

export type DeliveryMetrics = {
  readonly pending: number
  readonly failed: number
  readonly recentFailures: readonly {
    readonly channel: string
    readonly error: string
    readonly attempts: number
    readonly at: Date
  }[]
}

/**
 * Worker liveness.
 *
 * `stale` rather than `down`: the worker may be mid-restart, and the distinction
 * between "has not spoken recently" and "is gone" is not one this row can make.
 */
export type WorkerHealth = {
  readonly lastBeatAt: Date | null
  readonly stale: boolean
}

export type OperationsSnapshot = {
  readonly accounts: AccountMetrics
  readonly campaigns: CampaignMetrics
  readonly sessions: SessionMetrics
  readonly deliveries: DeliveryMetrics
  readonly worker: WorkerHealth
  readonly takenAt: Date
}
