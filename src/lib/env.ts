import { z } from 'zod'

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true')
const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
)
const optionalSecret = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional(),
)
const optionalPort = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.coerce.number().int().positive().max(65_535).optional(),
)

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    DATABASE_URL: z.string().min(1),

    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),

    /** AES-256-GCM key for secrets at rest: base64 that decodes to exactly 32 bytes. */
    ENCRYPTION_KEY: z.string().refine((value) => decodedLength(value) === 32, {
      error: 'must be base64 that decodes to exactly 32 bytes',
    }),

    ALLOWED_ORIGINS: z.string().default(''),

    SMTP_HOST: optionalText,
    SMTP_PORT: optionalPort,
    SMTP_USER: optionalSecret,
    SMTP_PASSWORD: optionalSecret,
    SMTP_FROM: optionalText,
    SMTP_SECURE: booleanString.default(false),
    SMTP_REQUIRE_TLS: booleanString.default(false),
    SMTP_TLS_REJECT_UNAUTHORIZED: booleanString.default(true),
    SMTP_TLS_SERVERNAME: optionalText,

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    DEFAULT_TIMEZONE: z.string().default('Europe/Warsaw'),
  })
  .superRefine((value, ctx) => {
    const hasUser = Boolean(value.SMTP_USER)
    const hasPassword = Boolean(value.SMTP_PASSWORD)

    if (hasUser !== hasPassword) {
      ctx.addIssue({
        code: 'custom',
        path: hasUser ? ['SMTP_PASSWORD'] : ['SMTP_USER'],
        message: 'SMTP_USER and SMTP_PASSWORD must be provided together',
      })
    }
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
