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
  readonly text: string
  readonly html?: string
  readonly attachments?: readonly MailAttachment[]
}

export type MailAttachment = {
  readonly filename: string
  readonly contentType: string
  readonly content: string
}

export type MailResult =
  | { readonly ok: true; readonly messageId: string }
  | { readonly ok: false; readonly retryable: boolean; readonly error: string }

export type MailVerificationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly retryable: boolean; readonly error: string }

export interface MailPort {
  readonly name: string
  verify(): Promise<MailVerificationResult>
  send(message: MailMessage): Promise<MailResult>
}
