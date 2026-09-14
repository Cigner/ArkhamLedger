import { z } from 'zod'

/**
 * Validated process environment.
 *
 * Parsed once at module load so a misconfigured deployment fails at startup
 * rather than at the first request that happens to need a missing variable.
 * Client-safe values must be prefixed NEXT_PUBLIC_ and read separately — they
 * are inlined at build time and cannot come from this module.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().min(1),

  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),

  /**
   * AES-256-GCM key for secrets at rest: base64 that decodes to exactly 32 bytes.
   *
   * Checked by decoding rather than by length. A 44-character string that is not
   * a 32-byte key passes a length check and then fails at the first encryption —
   * which happens in production, the first time somebody saves a webhook.
   */
  ENCRYPTION_KEY: z.string().refine((value) => decodedLength(value) === 32, {
    error: 'must be base64 that decodes to exactly 32 bytes',
  }),

  ALLOWED_ORIGINS: z.string().default(''),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((value) => value === 'true'),

  /** Pino levels, plus `silent` which suppresses output entirely (used by tests). */
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  /** Default IANA zone for new campaigns and users. */
  DEFAULT_TIMEZONE: z.string().default('Europe/Warsaw'),
})

function decodedLength(value: string): number {
  try {
    return Buffer.from(value, 'base64').length
  } catch {
    return 0
  }
}

export type ServerEnv = z.infer<typeof serverEnvSchema>

function loadEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse(process.env)

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }

  return parsed.data
}

export const env: ServerEnv = loadEnv()

export const isProduction = env.NODE_ENV === 'production'
export const isTest = env.NODE_ENV === 'test'
