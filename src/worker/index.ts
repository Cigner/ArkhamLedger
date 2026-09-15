import { Cron } from 'croner'
import { closePool } from '@/db/client'
import { env } from '@/lib/env'
import { appLogger } from '@/lib/logger'
import { cleanup } from './jobs/cleanup'
import { closeDeadlines } from './jobs/close-deadlines'
import { flushOutbox } from './jobs/flush-outbox'
import { idleCampaigns } from './jobs/idle-campaigns'
import { sendReminders } from './jobs/send-reminders'
import { beat, createDrain, runJob, type Job } from './runtime'

/**
 * The background worker.
 *
 * A separate process from the web tier, deliberately. Cron inside the web
 * process would run once per replica, so every notification would be sent as
 * many times as the application is scaled - and the first person to notice would
 * be whoever received four copies of the same email.
 *
 * Croner rather than node-cron: it understands daylight saving, and a throwing
 * handler does not silently stop being scheduled. The second property is why the
 * jobs are wrapped anyway - trust, but verify.
 *
 * Schedules are expressed in UTC. The only job whose local hour matters is the
 * daily one, and telling a Keeper about a quiet campaign at nine in the morning
 * rather than ten is not worth a time zone conversation.
 */
const SCHEDULES: readonly { readonly job: Job; readonly pattern: string }[] = [
  // The queue: often enough that a confirmation feels immediate.
  { job: flushOutbox, pattern: '*/30 * * * * *' },
  { job: closeDeadlines, pattern: '0 */5 * * * *' },
  { job: sendReminders, pattern: '0 */15 * * * *' },
  { job: idleCampaigns, pattern: '0 0 8 * * *' },
  { job: cleanup, pattern: '0 0 3 * * *' },
]

const DRAIN_TIMEOUT_MS = 15_000

function start(): void {
  const drain = createDrain()

  const crons = SCHEDULES.map(
    ({ job, pattern }) =>
      new Cron(pattern, { name: job.name, timezone: 'UTC', protect: true }, () =>
        drain.track(runJob(job, new Date())),
      ),
  )

  appLogger.info(
    { jobs: SCHEDULES.map((entry) => entry.job.name), env: env.NODE_ENV },
    'worker started',
  )

  /*
   * `protect: true` above is what keeps a slow run from overlapping itself: a
   * flush that takes longer than thirty seconds skips its next tick rather than
   * starting a second copy that fights it for the same rows.
   */
  void beat('startup', new Date())

  const shutdown = (signal: string) => {
    appLogger.info({ signal }, 'worker stopping')

    for (const cron of crons) cron.stop()

    void drain
      .drain(DRAIN_TIMEOUT_MS)
      .then(() => closePool())
      .finally(() => process.exit(0))
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  /*
   * A rejection nobody handled would otherwise take the process down under
   * Node's default, which is the one failure mode this worker cannot afford.
   */
  process.on('unhandledRejection', (reason) => {
    appLogger.error({ err: reason }, 'unhandled rejection in worker')
  })
}

start()
