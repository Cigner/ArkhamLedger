import { describe, expect, it } from 'vitest'
import { isWeakPassword } from '@/modules/identity/domain/weak-passwords'
import { passwordSchema, emailSchema, tokenSchema } from '@/modules/identity/domain/schemas'

/**
 * Password policy.
 *
 * The interesting cases are the ones that satisfy a length rule while remaining
 * trivial to guess, which is exactly what a length-only policy lets through.
 */
describe('isWeakPassword', () => {
  it.each([
    'password',
    'Password',
    'PASSWORD123',
    'p@ssw0rd',
    'passwordpassword',
    'qwerty123456',
    'letmein2026',
    'aaaaaaaaaaaaaaa',
    'correct123456horse',
    'cthulhu2026',
  ])('rejects %s', (candidate) => {
    expect(isWeakPassword(candidate)).toBe(true)
  })

  it.each([
    'correct horse battery staple',
    'the-shambler-from-the-stars',
    'Quiet Tuesdays In Providence',
    'x7Kq2mZr9Lp4',
  ])('accepts %s', (candidate) => {
    expect(isWeakPassword(candidate)).toBe(false)
  })

  it('sees through leet substitutions', () => {
    expect(isWeakPassword('p4ssw0rd')).toBe(true)
    expect(isWeakPassword('l3tm31n')).toBe(true)
  })
})

describe('passwordSchema', () => {
  it('requires at least twelve characters', () => {
    expect(passwordSchema.safeParse('short1234').success).toBe(false)
    expect(passwordSchema.safeParse('a-long-enough-passphrase').success).toBe(true)
  })

  it('rejects a long but obvious password', () => {
    const result = passwordSchema.safeParse('passwordpassword')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('identity.errors.passwordTooCommon')
    }
  })

  it('caps length so a huge input cannot be used to burn hashing time', () => {
    expect(passwordSchema.safeParse('a'.repeat(129) + 'Zx9!').success).toBe(false)
  })
})

describe('emailSchema', () => {
  it('normalises case and surrounding whitespace', () => {
    expect(emailSchema.parse('  Anna@Example.TEST ')).toBe('anna@example.test')
  })

  it.each(['not-an-email', 'missing@tld', '@example.test', 'spaces in@example.test'])(
    'rejects %s',
    (candidate) => {
      expect(emailSchema.safeParse(candidate).success).toBe(false)
    },
  )
})

describe('tokenSchema', () => {
  /*
   * Rejecting malformed tokens before they reach the database keeps id
   * enumeration and injection probes out of the query path entirely.
   */
  it('accepts a base64url token', () => {
    expect(tokenSchema.safeParse('HkGxd20gcSnYAyL2lKDFZL7VsJ5z55y-TmhrDEctjBY').success).toBe(true)
  })

  it.each(["' OR 1=1--", '../../etc/passwd', 'short', 'has spaces in it here padding padding'])(
    'rejects %s',
    (candidate) => {
      expect(tokenSchema.safeParse(candidate).success).toBe(false)
    },
  )
})
