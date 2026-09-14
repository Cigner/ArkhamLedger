import 'server-only'
import { createSafeActionClient } from 'next-safe-action'
import { headers } from 'next/headers'
import { z } from 'zod'
import { requireAdmin, requireUser } from '@/lib/auth'
import { AppError, isAppError } from '@/lib/errors'
import { appLogger, securityLogger } from '@/lib/logger'

/**
 * Server Action clients.
 *
 * Every mutation in the application goes through one of these. The chain is
 * fixed and deliberate: validate input, then authenticate, then authorize, then
 * touch data. Server Actions are public POST endpoints, so none of those steps
 * may be assumed to have happened earlier in the request.
 *
 * Errors are mapped here rather than in each action: an AppError carries an i18n
 * key the client can render, while anything unexpected is logged with its stack
 * and reported as a generic failure plus a correlation id the user can quote.
 */
export const actionMetadataSchema = z.object({
  /** Dotted action name used in logs and the audit trail, e.g. `admin.createUser`. */
  name: z.string(),
})

export type ActionMetadata = z.infer<typeof actionMetadataSchema>

export type ActionServerError = {
  code: string
  messageKey: string
  messageParams?: Record<string, string | number>
  correlationId?: string
}

async function correlationId(): Promise<string> {
  const requestHeaders = await headers()
  return requestHeaders.get('x-correlation-id') ?? 'unknown'
}

export const actionClient = createSafeActionClient({
  defineMetadataSchema: () => actionMetadataSchema,
  handleServerError: (error, utils): ActionServerError => {
    const name = utils.metadata?.name ?? 'unknown'

    if (isAppError(error)) {
      // Expected outcomes: a denied permission or a broken business rule. Logged
      // at warn so a burst of them is visible, but never with a stack trace.
      const logger =
        error.code === 'FORBIDDEN' || error.code === 'UNAUTHORIZED' ? securityLogger : appLogger
      logger.warn({ action: name, code: error.code, key: error.messageKey }, 'action rejected')

      return {
        code: error.code,
        messageKey: error.messageKey,
        ...(error.messageParams ? { messageParams: error.messageParams } : {}),
      }
    }

    appLogger.error({ action: name, err: error }, 'action failed')

    return { code: 'INTERNAL', messageKey: 'errors.unexpected' }
  },
}).use(async ({ next, metadata }) => {
  const started = Date.now()
  const result = await next()
  appLogger.debug(
    { action: metadata?.name, durationMs: Date.now() - started, ok: result.success },
    'action completed',
  )
  return result
})

/** Requires an active session. Injects the authenticated user. */
export const authActionClient = actionClient.use(async ({ next }) => {
  const user = await requireUser()
  return next({ ctx: { user, correlationId: await correlationId() } })
})

/** Requires the global administrator role. */
export const adminActionClient = actionClient.use(async ({ next }) => {
  const user = await requireAdmin()
  return next({ ctx: { user, correlationId: await correlationId() } })
})

/**
 * Unauthenticated actions: activation, password reset request, password reset.
 *
 * Separate from `actionClient` only to make the absence of an auth check
 * explicit at the call site — an action built on this client is public by
 * design, not by omission.
 */
export const publicActionClient = actionClient.use(async ({ next }) => {
  return next({ ctx: { correlationId: await correlationId() } })
})

export { AppError }
