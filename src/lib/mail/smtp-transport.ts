import nodemailer, { type Transporter } from 'nodemailer'
import { appLogger } from '@/lib/logger'
import type { MailMessage, MailPort, MailResult, MailVerificationResult } from './port'

export type SmtpConfig = {
  readonly host: string
  readonly port: number
  readonly secure: boolean
  readonly user?: string
  readonly password?: string
  readonly from: string
  readonly requireTls: boolean
  readonly tlsRejectUnauthorized: boolean
  readonly tlsServername?: string
}

const RETRYABLE_CODES = new Set([
  'ECONNECTION',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ECONNRESET',
  'ESOCKET',
  'EDNS',
])

export function createSmtpTransport(config: SmtpConfig): MailPort {
  const transporter: Transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTls,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    tls: {
      rejectUnauthorized: config.tlsRejectUnauthorized,
      ...(config.tlsServername ? { servername: config.tlsServername } : {}),
    },
    ...(config.user && config.password
      ? { auth: { user: config.user, pass: config.password } }
      : {}),
  })

  return {
    name: 'smtp',
    async verify(): Promise<MailVerificationResult> {
      try {
        await transporter.verify()
        return { ok: true }
      } catch (error) {
        const failure = smtpFailure(error)
        appLogger.error(
          { code: failure.code, responseCode: failure.responseCode },
          'smtp verification failed',
        )
        return failure.result
      }
    },
    async send(message: MailMessage): Promise<MailResult> {
      try {
        const info = await transporter.sendMail({
          from: config.from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
          ...(message.attachments?.length
            ? {
                attachments: message.attachments.map((attachment) => ({
                  filename: attachment.filename,
                  contentType: attachment.contentType,
                  content: attachment.content,
                })),
              }
            : {}),
        })
        return { ok: true, messageId: info.messageId }
      } catch (error) {
        const failure = smtpFailure(error)

        appLogger.warn(
          {
            to: message.to,
            code: failure.code,
            responseCode: failure.responseCode,
            retryable: failure.result.retryable,
          },
          'smtp delivery failed',
        )

        return failure.result
      }
    },
  }
}

export function smtpFailure(error: unknown): {
  readonly code: string | undefined
  readonly responseCode: number | undefined
  readonly result: Extract<MailResult, { ok: false }>
} {
  const smtpError = error as { code?: unknown; responseCode?: unknown; message?: unknown }
  const code = typeof smtpError.code === 'string' ? smtpError.code : undefined
  const responseCode =
    typeof smtpError.responseCode === 'number' ? smtpError.responseCode : undefined
  const message = typeof smtpError.message === 'string' ? smtpError.message : 'Unknown SMTP error'
  const retryable =
    (code !== undefined && RETRYABLE_CODES.has(code)) ||
    (responseCode !== undefined && responseCode >= 400 && responseCode < 500)
  const label = code ?? (responseCode ? `SMTP ${responseCode}` : 'SMTP')

  return {
    code,
    responseCode,
    result: { ok: false, retryable, error: `${label}: ${message}`.slice(0, 500) },
  }
}
