import { migrate } from 'drizzle-orm/mysql2/migrator'
import { drizzle } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'

/**
 * Migration entrypoint.
 *
 * Runs as a one-shot container before the web and worker services start, using
 * its own short-lived connection rather than the application pool. Exits
 * non-zero on failure so the deployment stops before new code sees an old schema.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required to run migrations')

  const connection = await mysql.createConnection({
    uri: url,
    timezone: 'Z',
    multipleStatements: true,
  })

  try {
    const db = drizzle(connection)
    console.log('Applying migrations…')
    await migrate(db, { migrationsFolder: './src/db/migrations' })
    console.log('Migrations applied.')
  } finally {
    await connection.end()
  }
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error)
  process.exit(1)
})
