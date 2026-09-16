import 'server-only'
import { env, isProduction } from '@/lib/env'
import { createLogTransport } from './log-transport'
import { createSmtpTransport } from './smtp-transport'
import type { MailPort } from './port'

/**
 * Mail transport selection.
 * Falls back to logging when SMTP is not configured.
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
    requireTls: env.SMTP_REQUIRE_TLS,
    tlsRejectUnauthorized: env.SMTP_TLS_REJECT_UNAUTHORIZED,
    ...(env.SMTP_TLS_SERVERNAME ? { tlsServername: env.SMTP_TLS_SERVERNAME } : {}),
    ...(env.SMTP_USER ? { user: env.SMTP_USER } : {}),
    ...(env.SMTP_PASSWORD ? { password: env.SMTP_PASSWORD } : {}),
  })
}

let cached: MailPort | undefined

export function mailer(): MailPort {
  cached ??= selectTransport()
  return cached
}

export type {
  MailAttachment,
  MailMessage,
  MailPort,
  MailResult,
  MailVerificationResult,
} from './port'
