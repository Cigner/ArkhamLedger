import pino, { type Logger } from 'pino'

/**
 * Structured logging.
 *
 * Three named streams share one transport so that Docker's json-file driver is
 * the only log sink: `app` for domain events, `security` for authentication and
 * authorization events, `http` for request timing.
 *
 * Never log credentials, full tokens or availability contents. Token values are
 * logged through `tokenPrefix()` only.
 */
const redactPaths = [
  'password',
  '*.password',
  'passwordHash',
  '*.passwordHash',
  'token',
  '*.token',
  'authorization',
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.cookie',
]

const isProduction = process.env.NODE_ENV === 'production'

const root: Logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: { paths: redactPaths, censor: '[redacted]' },
  base: { service: 'arkham-ledger' },
  formatters: {
    level: (label) => ({ level: label }),
  },
  ...(isProduction
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true, singleLine: false } } }),
})

export const appLogger = root.child({ stream: 'app' })
export const securityLogger = root.child({ stream: 'security' })
export const httpLogger = root.child({ stream: 'http' })

/** Binds a correlation id and actor to a logger for the lifetime of one request. */
export function requestLogger(correlationId: string, userId?: string): Logger {
  return appLogger.child(userId ? { correlationId, userId } : { correlationId })
}

/**
 * Safe representation of a secret token for logs: enough to correlate a log line
 * with a database row, not enough to use the token.
 */
export function tokenPrefix(token: string): string {
  return `${token.slice(0, 8)}…`
}

export { root as logger }
