import { MySqlContainer, type StartedMySqlContainer } from '@testcontainers/mysql'
import { drizzle } from 'drizzle-orm/mysql2'
import { migrate } from 'drizzle-orm/mysql2/migrator'
import mysql from 'mysql2/promise'

/**
 * Disposable MySQL for the integration suite.
 *
 * Runs once for the whole run, before any worker starts, and publishes its URL
 * through the environment so application modules — which read DATABASE_URL at
 * import time — connect to the container rather than to a developer's database.
 *
 * The container mirrors the production charset, collation and timezone flags
 * exactly. A suite passing on utf8mb4_general_ci while production runs
 * utf8mb4_0900_ai_ci is lying about sorting and unique-index collisions, which
 * is worse than having no suite.
 */
let container: StartedMySqlContainer | undefined

export async function setup(): Promise<void> {
  container = await new MySqlContainer('mysql:8.4')
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

  const url = `mysql://arkham:arkham@${container.getHost()}:${container.getPort()}/arkham_test?charset=utf8mb4`
  process.env['DATABASE_URL'] = url

  const connection = await mysql.createConnection({
    uri: url,
    timezone: 'Z',
    multipleStatements: true,
  })
  try {
    await migrate(drizzle(connection), { migrationsFolder: './src/db/migrations' })
  } finally {
    await connection.end()
  }
}

export async function teardown(): Promise<void> {
  await container?.stop()
}
