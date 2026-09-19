import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MySqlContainer, type StartedMySqlContainer } from '@testcontainers/mysql'
import mysql from 'mysql2/promise'
import { readFile, readdir } from 'node:fs/promises'

/**
 * The upgrade half of section 2.
 *
 * The suite's own database is built by running every migration against an empty
 * server, which proves the clean path and nothing else. Section 2 asks for both,
 * and the second one is where the risk actually is: `0005` widens two enums on
 * tables that already have rows, and adds a NOT NULL column to
 * `session_participant`. On an empty table every one of those is free.
 *
 * So this starts a server of its own, migrates it to `0004`, fills it with the
 * shapes production has, and only then applies the feature migration.
 */
const FEATURE = '0005_investigator_management'

let container: StartedMySqlContainer
let connection: mysql.Connection

/** Tags already run against this server, so a second call does not repeat them. */
const applied = new Set<string>()

async function applyUpTo(last: string): Promise<void> {
  const files = (await readdir('./src/db/migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const tag = file.replace('.sql', '')
    if (tag > last || applied.has(tag)) continue
    applied.add(tag)

    const sql = (await readFile(`./src/db/migrations/${file}`, 'utf8')).replaceAll(
      '--> statement-breakpoint',
      '',
    )
    await connection.query(sql)
  }
}

beforeAll(async () => {
  container = await new MySqlContainer('mysql:8.4')
    .withDatabase('arkham_upgrade')
    .withUsername('arkham')
    .withUserPassword('arkham')
    .withCommand([
      'mysqld',
      '--character-set-server=utf8mb4',
      '--collation-server=utf8mb4_0900_ai_ci',
      '--default-time-zone=+00:00',
    ])
    .start()

  connection = await mysql.createConnection({
    uri: `mysql://arkham:arkham@${container.getHost()}:${container.getPort()}/arkham_upgrade?charset=utf8mb4`,
    timezone: 'Z',
    multipleStatements: true,
  })
}, 180_000)

afterAll(async () => {
  await connection?.end()
  await container?.stop()
})

describe('upgrading a populated database', () => {
  it('applies the feature migration over the schema production is on', async () => {
    await applyUpTo('0004_demonic_domino')

    // The shapes that make the migration risky: rows in both tables whose enums
    // widen, and a session roster the new NOT NULL column has to land on.
    await connection.query(`
      INSERT INTO auth_user (id, email, name, role, status, created_at, updated_at)
      VALUES ('01AAAAAAAAAAAAAAAAAAAAAAAA', 'keeper@test', 'Keeper', 'USER', 'ACTIVE', NOW(3), NOW(3));
      INSERT INTO campaign (id, name, owner_id, status, timezone, created_at, updated_at)
      VALUES ('01BBBBBBBBBBBBBBBBBBBBBBBB', 'The Haunting', '01AAAAAAAAAAAAAAAAAAAAAAAA', 'ACTIVE', 'Europe/Warsaw', NOW(3), NOW(3));
      INSERT INTO game_session (id, campaign_id, title, status, search_window_start, search_window_end, grid_start_hour, grid_end_hour, min_session_hours, quorum, timezone, created_by, created_at, updated_at)
      VALUES ('01CCCCCCCCCCCCCCCCCCCCCCCC', '01BBBBBBBBBBBBBBBBBBBBBBBB', 'Chapter One', 'SCHEDULED', '2026-10-05', '2026-10-06', 16, 24, 6, 1, 'Europe/Warsaw', '01AAAAAAAAAAAAAAAAAAAAAAAA', NOW(3), NOW(3));
      INSERT INTO session_participant (id, game_session_id, user_id, priority, is_keeper, created_at, updated_at)
      VALUES ('01DDDDDDDDDDDDDDDDDDDDDDDD', '01CCCCCCCCCCCCCCCCCCCCCCCC', '01AAAAAAAAAAAAAAAAAAAAAAAA', 'PREFERRED', 1, NOW(3), NOW(3));
      INSERT INTO notification (id, user_id, type, campaign_id, payload, created_at, updated_at)
      VALUES ('01EEEEEEEEEEEEEEEEEEEEEEEE', '01AAAAAAAAAAAAAAAAAAAAAAAA', 'SESSION_SCHEDULED', '01BBBBBBBBBBBBBBBBBBBBBBBB', '{}', NOW(3), NOW(3));
    `)

    await applyUpTo(FEATURE)

    const [participants] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT plays_investigator FROM session_participant',
    )
    expect(participants[0]?.['plays_investigator']).toBe(0)

    // The rows that existed before the enums widened still say what they said.
    const [notifications] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT type FROM notification',
    )
    expect(notifications[0]?.['type']).toBe('SESSION_SCHEDULED')

    const [sessions] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT status FROM game_session',
    )
    expect(sessions[0]?.['status']).toBe('SCHEDULED')

    // And the widened values are now accepted.
    await connection.query(
      `UPDATE game_session SET status = 'IN_PROGRESS' WHERE id = '01CCCCCCCCCCCCCCCCCCCCCCCC'`,
    )
    await connection.query(
      `INSERT INTO notification (id, user_id, type, campaign_id, payload, created_at, updated_at)
       VALUES ('01FFFFFFFFFFFFFFFFFFFFFFFF', '01AAAAAAAAAAAAAAAAAAAAAAAA', 'INVESTIGATOR_LINKED', '01BBBBBBBBBBBBBBBBBBBBBBBB', '{}', NOW(3), NOW(3))`,
    )

    const [after] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM notification WHERE type = 'INVESTIGATOR_LINKED'`,
    )
    expect(after[0]?.['total']).toBe(1)

    const [tables] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM information_schema.tables
       WHERE table_schema = 'arkham_upgrade' AND table_name LIKE 'investigator%'`,
    )
    expect(Number(tables[0]?.['total'])).toBeGreaterThanOrEqual(20)
  }, 180_000)
})
