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

  /** AES-256-GCM key (base64, 32 bytes) for integration secrets at rest. */
  ENCRYPTION_KEY: z.string().min(44),

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
