import { sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { authAccount, authUser } from '@/db/schema'
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

export async function createUserRow(overrides: {
  email?: string
  name?: string
  role?: GlobalRole
  status?: UserStatus
} = {}): Promise<{ id: string; email: string; name: string }> {
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
