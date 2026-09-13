import { defineConfig } from 'drizzle-kit'

/**
 * drizzle-kit configuration.
 *
 * Used only in development to generate versioned SQL migrations, which are
 * committed. Production applies them with the runtime migrator (src/db/migrate.ts),
 * so drizzle-kit never ships in the deployed image.
 */
export default defineConfig({
  dialect: 'mysql',
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
})
