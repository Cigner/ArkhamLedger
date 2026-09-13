import 'server-only'
import { env, isProduction } from '@/lib/env'
import { createLogTransport } from './log-transport'
import { createSmtpTransport } from './smtp-transport'
import type { MailPort } from './port'

/**
 * Mail transport selection.
 *
 * Falls back to logging when SMTP is not configured, which keeps development
 * self-contained. In production that fallback is a hard failure instead: an
 * activation or reset email that silently goes to a log file is worse than a
 * deployment that refuses to start, because nobody notices until a user is
 * locked out.
 */
function selectTransport(): MailPort {
  const configured = Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_FROM)

  if (!configured) {
    if (isProduction) {
      throw new Error(
        'SMTP_HOST, SMTP_PORT and SMTP_FROM are required in production: password reset cannot work without them.',
      )
    }
    return createLogTransport()
  }

  return createSmtpTransport({
    host: env.SMTP_HOST!,
    port: env.SMTP_PORT!,
    secure: env.SMTP_SECURE,
    from: env.SMTP_FROM!,
    ...(env.SMTP_USER ? { user: env.SMTP_USER } : {}),
    ...(env.SMTP_PASSWORD ? { password: env.SMTP_PASSWORD } : {}),
  })
}

let cached: MailPort | undefined

export function mailer(): MailPort {
  cached ??= selectTransport()
  return cached
}

export type { MailMessage, MailPort, MailResult } from './port'
