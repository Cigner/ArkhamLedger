import 'server-only'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import type { AnyMySqlColumn, MySqlTable } from 'drizzle-orm/mysql-core'
import { type DbOrTx, db } from '@/db/client'
import {
  authUser,
  campaign,
  campaignInvitation,
  campaignMember,
  gameSession,
  scenario,
  userActivationToken,
} from '@/db/schema'
import { requireAdmin, requireUser } from '@/lib/auth'
import { NotFoundError } from '@/lib/errors'
import { NO_BLOCKERS, type DeletionBlockers } from '../domain/deletion'
import type { AdminUserListItem, GlobalRole, ProfileDto, UserStatus } from '../domain/types'

/**
 * User queries.
 *
 * Every exported function authorizes before it reads and returns a DTO rather
 * than a row. The row carries no password digest — that lives on auth_account —
 * but it does carry ban metadata and timestamps that have no reason to reach a
 * component, and narrowing here is what makes accidental disclosure impossible
 * rather than merely unlikely.
 */
export async function listUsersForAdmin(): Promise<AdminUserListItem[]> {
  await requireAdmin()

  const now = new Date()

  const rows = await db
    .select({
      id: authUser.id,
      email: authUser.email,
      name: authUser.name,
      role: authUser.role,
      status: authUser.status,
      createdAt: authUser.createdAt,
      activationExpiresAt: sql<Date | null>`max(${userActivationToken.expiresAt})`,
    })
    .from(authUser)
    .leftJoin(
      userActivationToken,
      and(
        eq(userActivationToken.userId, authUser.id),
        isNull(userActivationToken.usedAt),
        sql`${userActivationToken.expiresAt} > ${now}`,
      ),
    )
    .where(isNull(authUser.deletedAt))
    .groupBy(
      authUser.id,
      authUser.email,
      authUser.name,
      authUser.role,
      authUser.status,
      authUser.createdAt,
    )
    .orderBy(desc(authUser.createdAt))

  const blockers = await authoredCounts()

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt,
    hasPendingActivation: row.activationExpiresAt !== null,
    activationExpiresAt: row.activationExpiresAt,
    deletionBlockers: blockers.get(row.id) ?? NO_BLOCKERS,
  }))
}

/**
 * How much each account authored, for the whole table at once.
 *
 * Five grouped queries merged in memory rather than five correlated subqueries.
 * Not a performance choice at this size — Drizzle renders a correlated column
 * reference without its table's prefix, and more than one of these tables also
 * has an `id`, so the counts would come back silently zero. A grouped query
 * cannot be ambiguous that way.
 */
async function authoredCounts(): Promise<Map<string, DeletionBlockers>> {
  const merged = new Map<string, DeletionBlockers>()

  const absorb = async (
    table: MySqlTable,
    column: AnyMySqlColumn,
    key: keyof DeletionBlockers,
  ): Promise<void> => {
    const rows = await db
      // The column is typed loosely so one helper can serve five tables; the
      // cast restores what the schema already guarantees.
      .select({ userId: sql<string>`${column}`, total: sql<number>`count(*)` })
      .from(table)
      .groupBy(column)

    for (const row of rows) {
      if (!row.userId) continue
      const current = merged.get(row.userId) ?? NO_BLOCKERS
      merged.set(row.userId, { ...current, [key]: Number(row.total) })
    }
  }

  await absorb(campaign, campaign.ownerId, 'ownedCampaigns')
  await absorb(gameSession, gameSession.createdBy, 'createdSessions')
  await absorb(campaignInvitation, campaignInvitation.createdBy, 'createdInvitations')
  await absorb(scenario, scenario.createdBy, 'createdScenarios')
  await absorb(userActivationToken, userActivationToken.createdBy, 'issuedActivationTokens')

  return merged
}

/** The signed-in user's own profile; never another user's. */
export async function getOwnProfile(): Promise<ProfileDto> {
  const user = await requireUser()

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    timezone: user.timezone,
    locale: user.locale,
  }
}

/**
 * Internal lookup by id, without a DTO boundary.
 *
 * Callers are actions inside this module that need the status to evaluate a
 * rule. Not exported beyond the module and never returned to a component.
 */
export async function findUserRecord(
  userId: string,
  executor: DbOrTx = db,
): Promise<{ id: string; email: string; name: string; status: UserStatus; role: GlobalRole }> {
  const row = await executor.query.authUser.findFirst({
    where: and(eq(authUser.id, userId), isNull(authUser.deletedAt)),
    columns: { id: true, email: true, name: true, status: true, role: true },
  })

  if (!row) throw new NotFoundError()

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status,
    role: row.role,
  }
}

/**
 * Lookup by email for the password reset flow.
 *
 * Returns null instead of throwing: the caller must respond identically whether
 * or not the address exists, so a missing account cannot be an error path.
 */
export async function findUserByEmail(
  email: string,
): Promise<{ id: string; email: string; name: string; status: UserStatus } | null> {
  const row = await db.query.authUser.findFirst({
    where: and(eq(authUser.email, email), isNull(authUser.deletedAt)),
    columns: { id: true, email: true, name: true, status: true },
  })

  if (!row) return null

  return { id: row.id, email: row.email, name: row.name, status: row.status }
}

export async function updateUserStatus(
  userId: string,
  status: UserStatus,
  executor: DbOrTx = db,
): Promise<void> {
  await executor
    .update(authUser)
    .set({ status, updatedAt: new Date() })
    .where(eq(authUser.id, userId))
}

export async function updateOwnProfile(
  userId: string,
  patch: { name: string; timezone: string; locale: string },
): Promise<void> {
  await db
    .update(authUser)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(authUser.id, userId))
}

/**
 * What would have to be destroyed or orphaned to erase this account.
 *
 * One query per authored thing rather than a join, because each is a different
 * table with a different remedy and the numbers are tiny. Counted fresh every
 * time it is asked: this is the check that decides whether a destructive
 * operation is allowed, so a stale answer is worse than a slow one.
 */
export async function countDeletionBlockers(userId: string): Promise<DeletionBlockers> {
  await requireAdmin()

  const count = async (table: MySqlTable, column: AnyMySqlColumn): Promise<number> => {
    const [row] = await db
      .select({ total: sql<number>`count(*)` })
      .from(table)
      .where(eq(column, userId))

    return Number(row?.total ?? 0)
  }

  return {
    ownedCampaigns: await count(campaign, campaign.ownerId),
    createdSessions: await count(gameSession, gameSession.createdBy),
    createdInvitations: await count(campaignInvitation, campaignInvitation.createdBy),
    createdScenarios: await count(scenario, scenario.createdBy),
    issuedActivationTokens: await count(userActivationToken, userActivationToken.createdBy),
  }
}

/**
 * Closes an account without erasing what it did.
 *
 * Memberships end rather than remain: an account nobody can sign into would
 * otherwise still sit in a party list, count towards quorum and be waited on for
 * an answer that can never come. The membership rows stay, so attendance and
 * availability history survive.
 */
export async function softDeleteUser(input: {
  readonly userId: string
  readonly now: Date
  readonly executor: DbOrTx
}): Promise<void> {
  await input.executor
    .update(authUser)
    .set({
      deletedAt: input.now,
      status: 'DISABLED',
      updatedAt: input.now,
    })
    .where(eq(authUser.id, input.userId))

  await input.executor
    .update(campaignMember)
    .set({ status: 'REMOVED', leftAt: input.now, updatedAt: input.now })
    .where(and(eq(campaignMember.userId, input.userId), eq(campaignMember.status, 'ACTIVE')))
}

/**
 * Erases the row.
 *
 * Everything addressed to the person goes with it through the cascades —
 * sessions, availability, notifications, memberships, preferences. Everything
 * they authored blocks it instead, enforced by the database as well as by the
 * rule that runs first; if that rule is ever wrong, the delete fails loudly
 * rather than leaving half a person behind.
 */
export async function hardDeleteUser(input: {
  readonly userId: string
  readonly executor: DbOrTx
}): Promise<void> {
  await input.executor.delete(authUser).where(eq(authUser.id, input.userId))
}
