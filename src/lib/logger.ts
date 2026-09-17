import pino, { type Logger } from 'pino'

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

export function requestLogger(correlationId: string, userId?: string): Logger {
  return appLogger.child(userId ? { correlationId, userId } : { correlationId })
}

export function tokenPrefix(token: string): string {
  return `${token.slice(0, 8)}…`
}

export { root as logger }
