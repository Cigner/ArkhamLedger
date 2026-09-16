import { describe, expect, it } from 'vitest'
import { smtpFailure } from '@/lib/mail/smtp-transport'

describe('SMTP failure classification', () => {
  it('retries connection failures with an actionable message', () => {
    const failure = smtpFailure({ code: 'ECONNREFUSED', message: 'Connection refused' })

    expect(failure.result).toEqual({
      ok: false,
      retryable: true,
      error: 'ECONNREFUSED: Connection refused',
    })
  })

  it('retries temporary SMTP responses', () => {
    const failure = smtpFailure({
      code: 'EAUTH',
      responseCode: 454,
      message: 'Temporary authentication failure',
    })

    expect(failure.result.retryable).toBe(true)
  })

  it('does not retry invalid credentials or certificate configuration', () => {
    expect(
      smtpFailure({ code: 'EAUTH', responseCode: 535, message: 'Authentication failed' }).result
        .retryable,
    ).toBe(false)
    expect(smtpFailure({ code: 'ETLS', message: 'Self-signed certificate' }).result.retryable).toBe(
      false,
    )
  })
})
