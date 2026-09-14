import { sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { authAccount, authUser, campaign, campaignMember } from '@/db/schema'
import { newId } from '@/lib/ids'
import type { GlobalRole, UserStatus } from '@/modules/identity/domain/types'

/**
 * Test data builders.
 *
 * Inserts rows directly rather than going through the action layer, so a test
 * for one behaviour is not coupled to every rule that guards creating its
 * preconditions.
 */
export async function truncateAll(): Promise<void> {
  const rows = await db.execute<{ name: string }>(
    sql`SELECT TABLE_NAME AS name FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> '__drizzle_migrations'`,
  )

  const tables = (rows[0] as unknown as { name: string }[]).map((row) => row.name)

  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`)
  for (const table of tables) {
    await db.execute(sql.raw(`TRUNCATE TABLE \`${table}\``))
  }
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`)
}

export async function createUserRow(
  overrides: {
    email?: string
    name?: string
    role?: GlobalRole
    status?: UserStatus
  } = {},
): Promise<{ id: string; email: string; name: string }> {
  const id = newId()
  const now = new Date()
  const email = overrides.email ?? `user-${id.slice(-8).toLowerCase()}@example.test`
  const name = overrides.name ?? 'Test User'

  await db.insert(authUser).values({
    id,
    email,
    name,
    emailVerified: false,
    role: overrides.role ?? 'user',
    status: overrides.status ?? 'PENDING_ACTIVATION',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(authAccount).values({
    id: newId(),
    userId: id,
    accountId: id,
    providerId: 'credential',
    password: 'placeholder-digest',
    createdAt: now,
    updatedAt: now,
  })

  return { id, email, name }
}

export async function createCampaignRow(input: {
  ownerId: string
  name?: string
  status?: 'PLANNING' | 'ACTIVE' | 'ON_HIATUS' | 'COMPLETED' | 'ARCHIVED'
}): Promise<{ id: string }> {
  const id = newId()
  const now = new Date()

  await db.insert(campaign).values({
    id,
    name: input.name ?? 'The Haunting',
    ownerId: input.ownerId,
    status: input.status ?? 'PLANNING',
    timezone: 'Europe/Warsaw',
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(campaignMember).values({
    id: newId(),
    campaignId: id,
    userId: input.ownerId,
    role: 'KEEPER',
    status: 'ACTIVE',
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  })

  return { id }
}

export async function addMemberRow(input: {
  campaignId: string
  userId: string
  role?: 'KEEPER' | 'INVESTIGATOR'
  status?: 'ACTIVE' | 'LEFT' | 'REMOVED'
}): Promise<void> {
  const now = new Date()
  await db.insert(campaignMember).values({
    id: newId(),
    campaignId: input.campaignId,
    userId: input.userId,
    role: input.role ?? 'INVESTIGATOR',
    status: input.status ?? 'ACTIVE',
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  })
}
