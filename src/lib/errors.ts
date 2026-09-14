/**
 * Application error hierarchy.
 *
 * Every error that is safe to surface to a user extends AppError and carries a
 * stable machine-readable code plus an i18n key. Anything else that escapes to
 * the action layer is treated as unexpected: logged with a stack trace and
 * reported to the user as a generic failure with a correlation id.
 */
export type AppErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'DOMAIN_RULE'

export abstract class AppError extends Error {
  abstract readonly code: AppErrorCode
  abstract readonly httpStatus: number

  /** i18n key resolved by the presentation layer; never a pre-rendered sentence. */
  readonly messageKey: string
  readonly messageParams: Record<string, string | number> | undefined

  protected constructor(messageKey: string, messageParams?: Record<string, string | number>) {
    super(messageKey)
    this.name = new.target.name
    this.messageKey = messageKey
    this.messageParams = messageParams
  }
}

export class UnauthorizedError extends AppError {
  readonly code = 'UNAUTHORIZED' as const
  readonly httpStatus = 401

  constructor(messageKey = 'errors.unauthorized') {
    super(messageKey)
  }
}

export class ForbiddenError extends AppError {
  readonly code = 'FORBIDDEN' as const
  readonly httpStatus = 403

  constructor(messageKey = 'errors.forbidden') {
    super(messageKey)
  }
}

/**
 * Returned both for genuinely missing resources and for resources the caller is
 * not a member of. Answering 403 for the latter would make resource existence
 * discoverable by id enumeration.
 */
export class NotFoundError extends AppError {
  readonly code = 'NOT_FOUND' as const
  readonly httpStatus = 404

  constructor(messageKey = 'errors.notFound') {
    super(messageKey)
  }
}

export class ConflictError extends AppError {
  readonly code = 'CONFLICT' as const
  readonly httpStatus = 409

  constructor(messageKey: string, messageParams?: Record<string, string | number>) {
    super(messageKey, messageParams)
  }
}

export class RateLimitError extends AppError {
  readonly code = 'RATE_LIMITED' as const
  readonly httpStatus = 429
  readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number, messageKey = 'errors.rateLimited') {
    super(messageKey, { retryAfterSeconds })
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/**
 * A business rule rejected the operation. Carries the same shape as a domain
 * Result failure so rule violations can cross the layer boundary unchanged.
 */
export class DomainRuleError extends AppError {
  readonly code = 'DOMAIN_RULE' as const
  readonly httpStatus = 422

  constructor(messageKey: string, messageParams?: Record<string, string | number>) {
    super(messageKey, messageParams)
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}
