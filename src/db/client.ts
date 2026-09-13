import 'server-only'
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'
import { env, isProduction } from '@/lib/env'
import * as schema from './schema'

/**
 * Shared database connection pool.
 *
 * Cached on globalThis because Next's development server re-evaluates modules on
 * every hot reload, and a fresh pool per reload exhausts MySQL connections
 * within minutes.
 *
 * `timezone: 'Z'` makes the driver treat every DATETIME as UTC in both
 * directions, matching the server's --default-time-zone=+00:00.
 */
const globalForDb = globalThis as unknown as {
  __arkhamPool?: mysql.Pool
  __arkhamDb?: MySql2Database<typeof schema>
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
export const db: MySql2Database<typeof schema> =
  globalForDb.__arkhamDb ?? drizzle(pool, { schema, mode: 'default' })

if (!isProduction) {
  globalForDb.__arkhamPool = pool
  globalForDb.__arkhamDb = db
}

export type Database = typeof db
/** Transaction handle; accepted anywhere a Database is, so helpers compose. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
export type DbOrTx = Database | Transaction

export { schema }
