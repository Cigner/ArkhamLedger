/**
 * Outbound email port.
 *
 * The application depends on this interface rather than on a transport, so that
 * moving between a home SMTP relay and a hosted provider is one new file plus
 * one line of wiring. It is also what lets development run with no mail server
 * at all: the logging transport satisfies the same contract.
 */
export type MailMessage = {
  readonly to: string
  readonly subject: string
  /** Plain text body. Always sent — many clients and all screen readers prefer it. */
  readonly text: string
  readonly html?: string
  readonly attachments?: readonly MailAttachment[]
}

/**
 * A file sent with the message.
 *
 * Exists for the calendar invitation: an email saying a session is confirmed is
 * useful, and one that puts the session in the reader's calendar is the reason
 * they turn up. Content is a string because the only attachment this application
 * sends is text.
 */
export type MailAttachment = {
  readonly filename: string
  readonly contentType: string
  readonly content: string
}

export type MailResult =
  | { readonly ok: true; readonly messageId: string }
  | { readonly ok: false; readonly retryable: boolean; readonly error: string }

export interface MailPort {
  readonly name: string
  send(message: MailMessage): Promise<MailResult>
}
