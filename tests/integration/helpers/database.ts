import { MySqlContainer, type StartedMySqlContainer } from '@testcontainers/mysql'
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2'
import { migrate } from 'drizzle-orm/mysql2/migrator'
import mysql from 'mysql2/promise'
import * as schema from '@/db/schema'

/**
 * Disposable MySQL for integration tests.
 *
 * Runs the real migrations against a real server rather than an in-memory
 * substitute, because most of what these tests cover — unique constraints,
 * conditional updates, transaction isolation — exists only in the database.
 *
 * The container mirrors the production charset, collation and timezone flags
 * exactly. A suite that passes on utf8mb4_general_ci while production runs
 * utf8mb4_0900_ai_ci is lying about sorting and unique-index collisions.
 */
export type TestDatabase = {
  readonly db: MySql2Database<typeof schema>
  readonly connectionUrl: string
  stop(): Promise<void>
  truncateAll(): Promise<void>
}

export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedMySqlContainer = await new MySqlContainer('mysql:8.4')
    .withDatabase('arkham_test')
    .withUsername('arkham')
    .withUserPassword('arkham')
    .withCommand([
      'mysqld',
      '--character-set-server=utf8mb4',
      '--collation-server=utf8mb4_0900_ai_ci',
      '--default-time-zone=+00:00',
    ])
    .start()

  const connectionUrl = `mysql://arkham:arkham@${container.getHost()}:${container.getPort()}/arkham_test`

  const connection = await mysql.createConnection({
    uri: connectionUrl,
    timezone: 'Z',
    multipleStatements: true,
  })

  const db = drizzle(connection, { schema, mode: 'default' })
  await migrate(db, { migrationsFolder: './src/db/migrations' })

  return {
    db,
    connectionUrl,
    async stop() {
      await connection.end()
      await container.stop()
    },
    async truncateAll() {
      const [tables] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT TABLE_NAME AS name FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = 'arkham_test' AND TABLE_NAME <> '__drizzle_migrations'`,
      )

      await connection.query('SET FOREIGN_KEY_CHECKS = 0')
      for (const row of tables) {
        await connection.query(`TRUNCATE TABLE \`${String(row.name)}\``)
      }
      await connection.query('SET FOREIGN_KEY_CHECKS = 1')
    },
  }
}
