import 'server-only'
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'
import { env, isProduction } from '@/lib/env'
import * as schema from './schema'

/**
 * Shared database connection pool.
 *
 * Only the POOL is cached across hot reloads - creating one per reload exhausts
 * MySQL connections within minutes. The Drizzle wrapper is rebuilt every time
 * because it captures the schema at construction: caching it too means a newly
 * added relation is invisible until the dev server restarts, which costs more
 * confusion than the wrapper costs to build.
 *
 * `timezone: 'Z'` makes the driver treat every DATETIME as UTC in both
 * directions, matching the server's --default-time-zone=+00:00.
 */
const globalForDb = globalThis as unknown as {
  __arkhamPool?: mysql.Pool
}

function createPool(): mysql.Pool {
  return mysql.createPool({
    uri: env.DATABASE_URL,
    connectionLimit: isProduction ? 10 : 5,
    timezone: 'Z',
    charset: 'utf8mb4',
    dateStrings: false,
    supportBigNumbers: true,
    bigNumberStrings: false,
    enableKeepAlive: true,
  })
}

export const pool: mysql.Pool = globalForDb.__arkhamPool ?? createPool()

if (!isProduction) {
  globalForDb.__arkhamPool = pool
}

export const db: MySql2Database<typeof schema> = drizzle(pool, { schema, mode: 'default' })

export type Database = typeof db
/** Transaction handle; accepted anywhere a Database is, so helpers compose. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
export type DbOrTx = Database | Transaction

/**
 * Closes the pool so a process can exit.
 *
 * Only the worker needs this: the web tier lives as long as the container, while
 * the worker drains its jobs and exits on SIGTERM, and an open pool would hold
 * the process up until Docker loses patience and kills it.
 */
export async function closePool(): Promise<void> {
  await pool.end()
}

export { schema }
