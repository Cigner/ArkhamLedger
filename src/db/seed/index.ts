import { bootstrapAdmin } from '@/lib/auth'

/**
 * Seed entrypoint.
 *
 * Production seeding creates only the first administrator; every other account
 * is created through the admin panel so it gets an activation link and an audit
 * entry. Development seeding adds sample data on top, which lives in ./dev.ts.
 */
async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL
  const name = process.env.SEED_ADMIN_NAME ?? 'Administrator'
  const password = process.env.SEED_ADMIN_PASSWORD

  if (!email || !password) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required to seed.')
  }

  const result = await bootstrapAdmin({ email, name, password })

  console.log(
    result.created
      ? `Created administrator ${email} (${result.id}). Change this password after first sign-in.`
      : `Administrator ${email} already exists; nothing to do.`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('Seeding failed:', error)
    process.exit(1)
  })
