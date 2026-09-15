import { sql } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  availabilitySlot,
  campaign,
  campaignInvitation,
  campaignMember,
  gameSession,
  scenario,
  sessionParticipant,
  userActivationToken,
} from '@/db/schema'
import { provisionAccount } from '@/lib/auth'
import { issueToken } from '@/lib/crypto'
import { generateGridSlots, localHourToInstant } from '@/lib/datetime/slots'
import { newId } from '@/lib/ids'
import {
  DEV_PASSWORD,
  SEED_CAMPAIGNS,
  SEED_INVITATIONS,
  SEED_NOW,
  SEED_SESSIONS,
  SEED_USERS,
  type SeedSession,
} from './dev-data'

/**
 * Development seeding.
 *
 * Wipes and rebuilds the whole dataset so the database always matches the
 * fixture, rather than accumulating whatever previous runs left behind. That is
 * only acceptable because it refuses to run against production - the guard is
 * the first thing it does, and the reason a destructive seed is safe at all.
 *
 * Returns the material a developer needs to actually use the result: who to sign
 * in as, and the one-time links that exist nowhere else once generated.
 */
const DEFAULT_TIMEZONE = 'Europe/Warsaw'
const DEFAULT_GRID_START = 12
const DEFAULT_GRID_END = 24
const DEFAULT_MIN_HOURS = 6
const MS_PER_DAY = 24 * 60 * 60 * 1000

export type SeedReport = {
  readonly password: string
  readonly users: readonly { email: string; name: string; note: string }[]
  readonly activationLinks: readonly { name: string; url: string }[]
  readonly invitationLinks: readonly { campaign: string; label: string; url: string }[]
  readonly campaigns: readonly { name: string; status: string; members: number }[]
  readonly sessions: readonly { campaign: string; title: string; status: string }[]
}

/** Tables the dev fixture owns. Order is irrelevant: checks are off while truncating. */
const SEEDED_TABLES = [
  'availability_slot',
  'schedule_proposal',
  'schedule_run',
  'session_participant',
  'game_session',
  'campaign_invitation',
  'campaign_member',
  'campaign',
  'scenario',
  'notification_delivery',
  'notification',
  'campaign_integration',
  'user_activation_token',
  'identity_throttle',
  'auth_rate_limit',
  'auth_session',
  'auth_account',
  'auth_verification',
  'auth_user',
  'audit_log',
] as const

async function wipe(): Promise<void> {
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`)
  for (const table of SEEDED_TABLES) {
    await db.execute(sql.raw(`TRUNCATE TABLE \`${table}\``))
  }
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`)
}

export async function seedDevelopmentData(baseUrl: string): Promise<SeedReport> {
  await wipe()

  const now = SEED_NOW
  const userIds = new Map<string, string>()
  const users: { email: string; name: string; note: string }[] = []
  const activationLinks: { name: string; url: string }[] = []

  for (const user of SEED_USERS) {
    const { id } = await provisionAccount({
      email: user.email,
      name: user.name,
      password: DEV_PASSWORD,
      ...(user.role ? { role: user.role } : {}),
      ...(user.status ? { status: user.status } : {}),
    })
    userIds.set(user.key, id)
    users.push({ email: user.email, name: user.name, note: user.note })

    // An account awaiting activation is useless without the link that activates it.
    if (user.status === 'PENDING_ACTIVATION') {
      const { plaintext, hash } = issueToken()
      await db.insert(userActivationToken).values({
        id: newId(),
        userId: id,
        tokenHash: hash,
        expiresAt: new Date(now.getTime() + 7 * MS_PER_DAY),
        usedAt: null,
        createdBy: userIds.get('warden') ?? id,
        createdAt: now,
        updatedAt: now,
      })
      activationLinks.push({ name: user.name, url: `${baseUrl}/activate/${plaintext}` })
    }
  }

  const campaignIds = new Map<string, string>()
  const campaigns: { name: string; status: string; members: number }[] = []

  for (const seed of SEED_CAMPAIGNS) {
    const campaignId = newId()
    const ownerId = userIds.get(seed.ownerKey)
    if (!ownerId) throw new Error(`Unknown owner key: ${seed.ownerKey}`)

    let scenarioId: string | null = null
    if (seed.scenario) {
      scenarioId = newId()
      await db.insert(scenario).values({
        id: scenarioId,
        campaignId,
        name: seed.scenario.name,
        description: seed.scenario.description,
        createdBy: ownerId,
        createdAt: now,
        updatedAt: now,
      })
    }

    await db.insert(campaign).values({
      id: campaignId,
      name: seed.name,
      description: seed.description,
      ownerId,
      scenarioId,
      status: seed.status,
      timezone: DEFAULT_TIMEZONE,
      createdAt: now,
      updatedAt: now,
    })

    for (const member of seed.members) {
      const userId = userIds.get(member.userKey)
      if (!userId) throw new Error(`Unknown member key: ${member.userKey}`)

      await db.insert(campaignMember).values({
        id: newId(),
        campaignId,
        userId,
        role: member.role,
        status: member.status ?? 'ACTIVE',
        joinedAt: now,
        leftAt: member.status === 'ACTIVE' || !member.status ? null : now,
        createdAt: now,
        updatedAt: now,
      })
    }

    campaignIds.set(seed.key, campaignId)
    campaigns.push({
      name: seed.name,
      status: seed.status,
      members: seed.members.filter((member) => (member.status ?? 'ACTIVE') === 'ACTIVE').length,
    })
  }

  const invitationLinks: { campaign: string; label: string; url: string }[] = []

  for (const seed of SEED_INVITATIONS) {
    const campaignId = campaignIds.get(seed.campaignKey)
    if (!campaignId) throw new Error(`Unknown campaign key: ${seed.campaignKey}`)

    const { plaintext, hash } = issueToken()
    const expiresInDays = seed.expiresInDays ?? 14

    await db.insert(campaignInvitation).values({
      id: newId(),
      campaignId,
      tokenHash: hash,
      targetUserId: seed.targetUserKey ? (userIds.get(seed.targetUserKey) ?? null) : null,
      roleOnJoin: seed.roleOnJoin ?? 'INVESTIGATOR',
      maxUses: seed.maxUses ?? 1,
      usedCount: seed.usedCount ?? 0,
      expiresAt: new Date(now.getTime() + expiresInDays * MS_PER_DAY),
      revokedAt: seed.revoked ? now : null,
      createdBy: userIds.get(SEED_CAMPAIGNS.find((c) => c.key === seed.campaignKey)!.ownerKey)!,
      createdAt: now,
      updatedAt: now,
    })

    invitationLinks.push({
      campaign: SEED_CAMPAIGNS.find((c) => c.key === seed.campaignKey)!.name,
      label: seed.label,
      url: `${baseUrl}/invite/${plaintext}`,
    })
  }

  const sessions: { campaign: string; title: string; status: string }[] = []

  for (const seed of SEED_SESSIONS) {
    const campaignId = campaignIds.get(seed.campaignKey)
    if (!campaignId) throw new Error(`Unknown campaign key: ${seed.campaignKey}`)

    const sessionId = newId()
    await insertSession(sessionId, campaignId, seed, userIds, keepersOf(seed.campaignKey), now)

    sessions.push({
      campaign: SEED_CAMPAIGNS.find((c) => c.key === seed.campaignKey)!.name,
      title: seed.title,
      status: seed.status,
    })
  }

  return {
    password: DEV_PASSWORD,
    users,
    activationLinks,
    invitationLinks,
    campaigns,
    sessions,
  }
}

/**
 * Who runs the game in a given campaign.
 *
 * Read from the campaign's own membership rather than from a list of names: the
 * same person is a Keeper in one campaign and a player in another, and flagging
 * them as a Keeper everywhere makes them a hard constraint on sessions they are
 * merely invited to - which silently rules out every date in those sessions.
 */
function keepersOf(campaignKey: string): ReadonlySet<string> {
  const campaignSeed = SEED_CAMPAIGNS.find((entry) => entry.key === campaignKey)

  return new Set(
    (campaignSeed?.members ?? [])
      .filter((member) => member.role === 'KEEPER')
      .map((member) => member.userKey),
  )
}

/**
 * Writes one session with its participants and availability.
 *
 * Availability is expanded from local hour ranges into the exact grid slots the
 * application would generate, so the seeded rows are indistinguishable from ones
 * a player produced - including on the night the clocks go back, where the grid
 * has twenty-five hours and two of them carry the same label.
 */
async function insertSession(
  sessionId: string,
  campaignId: string,
  seed: SeedSession,
  userIds: ReadonlyMap<string, string>,
  keeperKeys: ReadonlySet<string>,
  now: Date,
): Promise<void> {
  const gridStartHour = seed.gridStartHour ?? DEFAULT_GRID_START
  const gridEndHour = seed.gridEndHour ?? DEFAULT_GRID_END
  const createdBy = userIds.get(seed.participants[0]?.userKey ?? '')

  await db.insert(gameSession).values({
    id: sessionId,
    campaignId,
    title: seed.title,
    description: seed.description,
    scenarioId: null,
    status: seed.status,
    searchWindowStart: seed.windowStart,
    searchWindowEnd: seed.windowEnd,
    gridStartHour,
    gridEndHour,
    minSessionHours: seed.minSessionHours ?? DEFAULT_MIN_HOURS,
    quorum: seed.quorum ?? 1,
    availabilityDeadline:
      seed.deadlineInDays === undefined
        ? null
        : new Date(now.getTime() + seed.deadlineInDays * MS_PER_DAY),
    timezone: DEFAULT_TIMEZONE,
    confirmedStartUtc: seed.confirmed
      ? localHourToInstant(seed.confirmed.date, seed.confirmed.fromHour, DEFAULT_TIMEZONE)
      : null,
    confirmedEndUtc: seed.confirmed
      ? localHourToInstant(seed.confirmed.date, seed.confirmed.toHour, DEFAULT_TIMEZONE)
      : null,
    acceptedProposalId: null,
    setManually: false,
    cancelledReason: seed.cancelledReason ?? null,
    createdBy: createdBy ?? [...userIds.values()][0]!,
    createdAt: now,
    updatedAt: now,
  })

  for (const participant of seed.participants) {
    const userId = userIds.get(participant.userKey)
    if (!userId) throw new Error(`Unknown participant key: ${participant.userKey}`)

    await db.insert(sessionParticipant).values({
      id: newId(),
      gameSessionId: sessionId,
      userId,
      priority: participant.priority,
      isKeeper: keeperKeys.has(participant.userKey),
      // A day before the anchor: people answered before now, and a response
      // stamped at exactly "now" reads to the app as one that just arrived.
      respondedAt: participant.responded ? new Date(now.getTime() - MS_PER_DAY) : null,
      attendance: participant.attendance ?? 'UNKNOWN',
      createdAt: now,
      updatedAt: now,
    })
  }

  if (!seed.availability?.length) return

  const slots = generateGridSlots({
    startDate: seed.windowStart,
    endDate: seed.windowEnd,
    startHour: gridStartHour,
    endHour: gridEndHour,
    timeZone: DEFAULT_TIMEZONE,
  })

  const rows = seed.availability.flatMap((range) => {
    const userId = userIds.get(range.userKey)
    if (!userId) throw new Error(`Unknown availability key: ${range.userKey}`)

    return slots
      .filter(
        (slot) =>
          slot.localDate === range.date &&
          slot.localHour >= range.fromHour &&
          slot.localHour < range.toHour,
      )
      .map((slot) => ({
        id: newId(),
        gameSessionId: sessionId,
        userId,
        slotStartUtc: new Date(slot.startUtc),
        localDate: slot.localDate,
        localHour: slot.localHour,
        state: range.state,
        createdAt: now,
        updatedAt: now,
      }))
  })

  if (rows.length > 0) await db.insert(availabilitySlot).values(rows)
}
