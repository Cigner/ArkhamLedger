import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

const TOKEN_BYTES = 32

export type IssuedToken = {
  readonly plaintext: string
  readonly hash: string
}

export function issueToken(): IssuedToken {
  const plaintext = randomBytes(TOKEN_BYTES).toString('base64url')
  return { plaintext, hash: hashToken(plaintext) }
}

export function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex')
}

export function tokensMatch(presentedHash: string, storedHash: string): boolean {
  const a = Buffer.from(presentedHash, 'hex')
  const b = Buffer.from(storedHash, 'hex')
  if (a.length !== b.length || a.length === 0) return false
  return timingSafeEqual(a, b)
}

const IV_BYTES = 12

export function encryptSecret(plaintext: string, key: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', decodeKey(key), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])

  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.')
}

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
