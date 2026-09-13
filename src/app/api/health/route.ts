import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/db/client'

/**
 * Liveness and readiness probe.
 *
 * Consumed by the container HEALTHCHECK and by compose's service_healthy gate.
 * Deliberately terse: it reports whether the process can reach its database and
 * nothing about library versions, paths or configuration, which would be free
 * reconnaissance for an attacker who reaches the port.
 */
export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  const startedAt = Date.now()

  let database: 'up' | 'down' = 'down'
  try {
    await db.execute(sql`select 1`)
    database = 'up'
  } catch {
    database = 'down'
  }

  const body = {
    status: database === 'up' ? ('ok' as const) : ('degraded' as const),
    database,
    uptimeSeconds: Math.round(process.uptime()),
    checkDurationMs: Date.now() - startedAt,
  }

  return NextResponse.json(body, { status: database === 'up' ? 200 : 503 })
}
