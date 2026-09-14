import { NextResponse } from 'next/server'
import { lastHeartbeat } from '@/worker/runtime'

/**
 * Whether the background worker is alive.
 *
 * Separate from the main health check because the failure it detects is
 * invisible from the web tier: the site stays up, pages render, and meanwhile
 * nothing is delivered, no deadline closes and no reminder goes out. The first
 * symptom without this endpoint is somebody missing a session.
 *
 * The threshold is generous compared to the most frequent job, so a slow tick
 * does not read as an outage.
 */
export const dynamic = 'force-dynamic'

const STALE_AFTER_MS = 5 * 60_000

export async function GET(): Promise<NextResponse> {
  let beatAt: Date | null = null

  try {
    beatAt = await lastHeartbeat()
  } catch {
    return NextResponse.json({ status: 'degraded', worker: 'unknown' }, { status: 503 })
  }

  const age = beatAt ? Date.now() - beatAt.getTime() : null
  const alive = age !== null && age < STALE_AFTER_MS

  return NextResponse.json(
    {
      status: alive ? 'ok' : 'degraded',
      worker: alive ? 'up' : 'down',
      ...(age === null ? {} : { lastBeatSecondsAgo: Math.round(age / 1000) }),
    },
    { status: alive ? 200 : 503 },
  )
}
