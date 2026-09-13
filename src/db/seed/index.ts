import { bootstrapAdmin } from '@/lib/auth'
import { seedDevelopmentData, type SeedReport } from './dev'

/**
 * Seed entrypoint.
 *
 * Two modes with very different risk profiles, which is why they are separate
 * commands rather than a flag with a default:
 *
 *   `npm run db:seed`      creates only the first administrator. Idempotent,
 *                          safe to run on every deploy, touches nothing else.
 *   `npm run db:seed:dev`  wipes every table and rebuilds the whole fixture.
 *
 * The destructive mode refuses to run unless the environment says it is
 * development and the database is not the production one. Those checks are the
 * entire reason a truncating seed is acceptable at all, so they come first and
 * exit non-zero rather than warning.
 */
function assertSafeForDestructiveSeed(): void {
  const environment = process.env['NODE_ENV'] ?? 'development'

  if (environment === 'production') {
    throw new Error('Refusing to run the development seed with NODE_ENV=production.')
  }

  const url = process.env['DATABASE_URL'] ?? ''
  const host = /@([^:/]+)/.exec(url)?.[1] ?? ''
  const isLocalHost = ['localhost', '127.0.0.1', 'db', 'mysql', '::1'].includes(host)

  if (!isLocalHost) {
    throw new Error(
      `Refusing to wipe a database on host "${host}". The development seed only runs against a local database.`,
    )
  }

  if (process.env['ALLOW_DESTRUCTIVE_SEED'] === 'false') {
    throw new Error('Destructive seeding is disabled by ALLOW_DESTRUCTIVE_SEED=false.')
  }
}

function heading(text: string): void {
  console.log(`\n${text}\n${'─'.repeat(text.length)}`)
}

function printReport(report: SeedReport): void {
  heading('Accounts')
  console.log(`Every account below uses the password: ${report.password}\n`)
  for (const user of report.users) {
    console.log(`  ${user.email.padEnd(24)} ${user.name.padEnd(22)} ${user.note}`)
  }

  if (report.activationLinks.length > 0) {
    heading('Activation links (shown once, nowhere else)')
    for (const link of report.activationLinks) {
      console.log(`  ${link.name}\n    ${link.url}`)
    }
  }

  heading('Campaigns')
  for (const campaign of report.campaigns) {
    console.log(`  ${campaign.status.padEnd(10)} ${campaign.name} — ${campaign.members} members`)
  }

  heading('Sessions')
  for (const session of report.sessions) {
    console.log(`  ${session.status.padEnd(11)} ${session.title}  (${session.campaign})`)
  }

  heading('Invitation links (shown once, nowhere else)')
  for (const link of report.invitationLinks) {
    console.log(`  ${link.label}\n    ${link.url}`)
  }

  console.log('')
}

async function seedProduction(): Promise<void> {
  const email = process.env['SEED_ADMIN_EMAIL']
  const name = process.env['SEED_ADMIN_NAME'] ?? 'Administrator'
  const password = process.env['SEED_ADMIN_PASSWORD']

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

async function seedDevelopment(): Promise<void> {
  assertSafeForDestructiveSeed()

  const baseUrl = process.env['BETTER_AUTH_URL'] ?? 'http://localhost:3000'

  console.log('Wiping and rebuilding the development dataset…')
  const report = await seedDevelopmentData(baseUrl)
  printReport(report)
}

const mode = process.argv.includes('--dev') ? 'development' : 'production'

const run = mode === 'development' ? seedDevelopment : seedProduction

run()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(`\nSeeding failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
