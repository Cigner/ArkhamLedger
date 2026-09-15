import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

/**
 * Cryptographic primitives: link tokens, and secrets that must be read back.
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

/**
 * Symmetric encryption for secrets the application has to be able to read back.
 *
 * Distinct from token hashing above and not interchangeable with it: a token is
 * only ever compared, so a digest is enough and is safer. A webhook URL has to
 * be sent to Discord, so it must be recoverable - which makes the key, not the
 * ciphertext, the thing that has to be protected.
 *
 * AES-256-GCM: the tag authenticates the ciphertext, so a tampered value fails
 * to decrypt rather than decrypting to something else.
 */
const IV_BYTES = 12

/** Serialised as `iv.tag.ciphertext`, all base64url. */
export function encryptSecret(plaintext: string, key: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', decodeKey(key), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])

  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.')
}

/**
 * Recovers a secret, or throws.
 *
 * Failure is not recoverable by the caller and must not be swallowed: a webhook
 * that silently decrypts to nothing would post an empty message forever, which
 * looks like a Discord problem rather than a key problem.
 */
export function decryptSecret(encoded: string, key: string): string {
  const parts = encoded.split('.')
  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64url'))

  if (parts.length !== 3 || !iv || !tag || !ciphertext) {
    throw new Error('Malformed ciphertext: expected iv.tag.payload')
  }

  const decipher = createDecipheriv('aes-256-gcm', decodeKey(key), iv)
  decipher.setAuthTag(tag)

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

function decodeKey(key: string): Buffer {
  const decoded = Buffer.from(key, 'base64')
  if (decoded.length !== 32) {
    throw new Error('ENCRYPTION_KEY must decode to 32 bytes of base64')
  }
  return decoded
}
