import 'server-only'
import { hashPassword } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { authAccount, authUser } from '@/db/schema'
import { newId } from '@/lib/ids'

/**
 * First administrator bootstrap.
 *
 * Writes the account rows directly rather than going through the admin API,
 * because that API requires an existing administrator session and the first
 * administrator has nobody to authorize them. This is the one place that is
 * allowed to bypass it, and only for an account that does not exist yet.
 *
 * Idempotent: running it against a deployment that already has this address is a
 * no-op, so it is safe to invoke on every deploy.
 */
export async function bootstrapAdmin(input: {
  email: string
  name: string
  password: string
}): Promise<{ id: string; created: boolean }> {
  const existing = await db.query.authUser.findFirst({
    where: eq(authUser.email, input.email),
    columns: { id: true },
  })

  if (existing) return { id: existing.id, created: false }

  const userId = newId()
  const now = new Date()
  const digest = await hashPassword(input.password)

  await db.transaction(async (tx) => {
    await tx.insert(authUser).values({
      id: userId,
      email: input.email,
      name: input.name,
      emailVerified: true,
      role: 'admin',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    })

    await tx.insert(authAccount).values({
      id: newId(),
      userId,
      accountId: userId,
      providerId: 'credential',
      password: digest,
      createdAt: now,
      updatedAt: now,
    })
  })

  return { id: userId, created: true }
}
