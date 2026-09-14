import 'server-only'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { type DbOrTx, db } from '@/db/client'
import { authUser, userActivationToken } from '@/db/schema'
import { requireAdmin, requireUser } from '@/lib/auth'
import { NotFoundError } from '@/lib/errors'
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

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt,
    hasPendingActivation: row.activationExpiresAt !== null,
    activationExpiresAt: row.activationExpiresAt,
  }))
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
