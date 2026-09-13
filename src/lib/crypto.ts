import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Token generation and comparison for activation, invitation and reset links.
 *
 * Tokens are 256 bits of CSPRNG output. Only their SHA-256 digest is persisted,
 * so a database disclosure does not yield usable links. Lookups hash the
 * presented token and compare digests in constant time.
 */
const TOKEN_BYTES = 32

export type IssuedToken = {
  /** Shown to the user exactly once; never stored, never logged in full. */
  readonly plaintext: string
  /** Persisted value. */
  readonly hash: string
}

export function issueToken(): IssuedToken {
  const plaintext = randomBytes(TOKEN_BYTES).toString('base64url')
  return { plaintext, hash: hashToken(plaintext) }
}

export function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex')
}

/** Constant-time digest comparison; length mismatch short-circuits safely. */
export function tokensMatch(presentedHash: string, storedHash: string): boolean {
  const a = Buffer.from(presentedHash, 'hex')
  const b = Buffer.from(storedHash, 'hex')
  if (a.length !== b.length || a.length === 0) return false
  return timingSafeEqual(a, b)
}
