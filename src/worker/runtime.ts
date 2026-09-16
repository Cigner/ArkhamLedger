import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { workerHeartbeat } from '@/db/schema'
import { appLogger } from '@/lib/logger'

/**
 * The worker's scaffolding: a pulse, and error isolation between jobs.
 *
 * One rule governs everything here - a job that throws must not take the process
 * with it. A worker that dies has no visible symptom from the web tier: no
 * notifications arrive, no deadline closes, and the first person to notice is
 * somebody who missed a session. So every job runs inside a boundary that logs
 * and returns, and every run leaves a heartbeat behind for the health check to
 * read.
 */
const HEARTBEAT_ID = 'worker'

export type JobResult = {
  readonly handled: number
}

export type Job = {
  readonly name: string
  readonly run: (now: Date) => Promise<JobResult>
}

export async function runJob(job: Job, now: Date): Promise<void> {
  const started = Date.now()

  try {
    const result = await job.run(now)

    if (result.handled > 0) {
      appLogger.info(
        { job: job.name, handled: result.handled, durationMs: Date.now() - started },
        'worker job completed',
      )
    }

    await beat(job.name, now)
  } catch (error) {
    appLogger.error(
      { job: job.name, err: error, durationMs: Date.now() - started },
      'worker job failed',
    )
  }
}

export async function beat(lastJob: string, now: Date): Promise<void> {
  await db
    .insert(workerHeartbeat)
    .values({ id: HEARTBEAT_ID, beatAt: now })
    .onDuplicateKeyUpdate({ set: { beatAt: now } })

  appLogger.debug({ lastJob }, 'worker heartbeat')
}

export async function lastHeartbeat(): Promise<Date | null> {
  const [row] = await db
    .select({ beatAt: workerHeartbeat.beatAt })
    .from(workerHeartbeat)
    .where(eq(workerHeartbeat.id, HEARTBEAT_ID))
    .limit(1)

  return row?.beatAt ?? null
}

export function createDrain(): {
  track: <T>(work: Promise<T>) => Promise<T>
  drain: (timeoutMs: number) => Promise<void>
} {
  const inFlight = new Set<Promise<unknown>>()

  return {
    track<T>(work: Promise<T>): Promise<T> {
      inFlight.add(work)
      void work.finally(() => inFlight.delete(work))
      return work
    },

    async drain(timeoutMs: number): Promise<void> {
      if (inFlight.size === 0) return

      appLogger.info({ inFlight: inFlight.size }, 'worker draining')

      await Promise.race([
        Promise.allSettled([...inFlight]),
        new Promise((resolve) => setTimeout(resolve, timeoutMs)),
      ])
    },
  }
}
