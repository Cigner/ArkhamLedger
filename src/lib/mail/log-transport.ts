import { appLogger } from '@/lib/logger'
import type { MailMessage, MailPort, MailResult } from './port'

/**
 * Development transport.
 *
 * Writes the message to the log instead of sending it, so the activation and
 * reset flows are exercisable without a mail server. It logs the full body on
 * purpose — that body contains the link a developer needs — which is exactly why
 * selecting it in production is refused at startup.
 */
export function createLogTransport(): MailPort {
  return {
    name: 'log',
    send(message: MailMessage): Promise<MailResult> {
      appLogger.info(
        { to: message.to, subject: message.subject, body: message.text },
        'email not sent: no transport configured',
      )
      return Promise.resolve({ ok: true, messageId: `log-${Date.now()}` })
    },
  }
}
