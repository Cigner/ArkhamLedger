import nodemailer, { type Transporter } from 'nodemailer'
import { appLogger } from '@/lib/logger'
import type { MailMessage, MailPort, MailResult } from './port'

/**
 * SMTP transport.
 *
 * Failures are classified rather than thrown: a 4xx response or a connection
 * problem is retryable and the delivery worker will try again, while a 5xx
 * rejection is permanent and retrying only burns reputation with the relay.
 */
export type SmtpConfig = {
  readonly host: string
  readonly port: number
  readonly secure: boolean
  readonly user?: string
  readonly password?: string
  readonly from: string
}

const RETRYABLE_CODES = new Set(['ECONNECTION', 'ETIMEDOUT', 'ECONNRESET', 'ESOCKET', 'EDNS'])

export function createSmtpTransport(config: SmtpConfig): MailPort {
  const transporter: Transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.user && config.password
      ? { auth: { user: config.user, pass: config.password } }
      : {}),
  })

  return {
    name: 'smtp',
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
        const code = (error as { code?: string }).code
        const responseCode = (error as { responseCode?: number }).responseCode
        const retryable =
          (code !== undefined && RETRYABLE_CODES.has(code)) ||
          (responseCode !== undefined && responseCode >= 400 && responseCode < 500)

        appLogger.warn({ to: message.to, code, responseCode, retryable }, 'smtp delivery failed')

        return {
          ok: false,
          retryable,
          error: code ?? String(responseCode ?? 'unknown'),
        }
      }
    },
  }
}
