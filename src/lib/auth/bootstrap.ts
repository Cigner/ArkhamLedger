import 'server-only'
import { hashPassword } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { authAccount, authUser } from '@/db/schema'
import { newId } from '@/lib/ids'
import { passwordSchema } from '@/modules/identity/domain/schemas'

/**
 * Account provisioning that bypasses the admin API.
 *
 * The admin API requires an existing administrator session, which the first
 * administrator by definition cannot have, and which a seed script has no way to
 * obtain. These two functions are the only places allowed to write account rows
 * directly, and both refuse to touch an address that already exists.
 *
 * Anything a signed-in administrator does goes through the action layer instead,
 * where it is authorized and audited.
 */
export type ProvisionedAccount = {
  readonly email: string
  readonly name: string
  readonly password: string
  readonly role?: 'user' | 'admin'
  readonly status?: 'PENDING_ACTIVATION' | 'ACTIVE' | 'DISABLED'
  readonly timezone?: string
}

/**
 * Creates an account with a password already set.
 *
 * Idempotent by email: running it against an existing address is a no-op, so it
 * is safe to invoke on every deploy.
 */
export async function provisionAccount(
  input: ProvisionedAccount,
): Promise<{ id: string; created: boolean }> {
  const existing = await db.query.authUser.findFirst({
    where: eq(authUser.email, input.email),
    columns: { id: true },
  })

  if (existing) return { id: existing.id, created: false }

  /*
   * These functions write the account row directly and therefore skip the
   * action layer, which is where every other password is checked. Applying the
   * policy here too means a seed or a bootstrap cannot create an account whose
   * password the application would refuse - a gap that is invisible until
   * somebody tries to sign in.
   */
  const password = passwordSchema.safeParse(input.password)
  if (!password.success) {
    throw new Error(
      `Refusing to provision ${input.email}: the password does not meet the policy (${password.error.issues[0]?.message ?? 'invalid'}).`,
    )
  }

  const userId = newId()
  const now = new Date()
  const digest = await hashPassword(password.data)
  const status = input.status ?? 'ACTIVE'

  await db.transaction(async (tx) => {
    await tx.insert(authUser).values({
      id: userId,
      email: input.email,
      name: input.name,
      emailVerified: status === 'ACTIVE',
      role: input.role ?? 'user',
      status,
      timezone: input.timezone ?? 'Europe/Warsaw',
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

/** The first administrator, who has nobody to issue them an activation link. */
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

  return provisionAccount({ ...input, role: 'admin', status: 'ACTIVE' })
}
