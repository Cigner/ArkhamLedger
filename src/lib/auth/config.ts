import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins/admin'
import { nextCookies } from 'better-auth/next-js'
import { db } from '@/db/client'
import * as schema from '@/db/schema'
import { env, isProduction } from '@/lib/env'
import { newId } from '@/lib/ids'
import { securityLogger } from '@/lib/logger'
import { mailer } from '@/lib/mail'
import { passwordChangedEmail, passwordResetEmail } from '@/modules/identity/domain/emails'
import { clearAttempts, consumeAttempt, type ThrottleScope } from '@/lib/throttle'

/**
 * Authentication instance.
 *
 * This module is the only place in the codebase that touches the auth library
 * directly; everything else goes through the port in ./port.ts.
 *
 * Table names are mapped explicitly.
 */
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const SESSION_REFRESH_SECONDS = 60 * 60 * 24
const RESET_TOKEN_TTL_SECONDS = 60 * 60

/** Endpoints throttled by email address in addition to the library's IP limit. */
const THROTTLED_PATHS: Record<string, ThrottleScope | undefined> = {
  '/sign-in/email': 'signin',
  '/request-password-reset': 'reset',
}

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,

  database: drizzleAdapter(db, {
    provider: 'mysql',
    schema: {
      user: schema.authUser,
      session: schema.authSession,
      account: schema.authAccount,
      verification: schema.authVerification,
      rateLimit: schema.authRateLimit,
    },
  }),

  emailAndPassword: {
    enabled: true,
    // There is no public sign-up yet: accounts are created by an administrator.
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    requireEmailVerification: false,

    resetPasswordTokenExpiresIn: RESET_TOKEN_TTL_SECONDS,
    revokeSessionsOnPasswordReset: true,

    sendResetPassword: async ({ user, token }) => {
      const url = `${env.BETTER_AUTH_URL}/reset-password/${token}`
      const body = passwordResetEmail(user.name, url)

      const result = await mailer().send({ to: user.email, ...body })
      if (!result.ok) {
        securityLogger.error(
          { userId: user.id, retryable: result.retryable, error: result.error },
          'password reset email could not be delivered',
        )
      }
    },

    onPasswordReset: async ({ user }) => {
      securityLogger.info({ userId: user.id }, 'password reset completed')
      const result = await mailer().send({
        to: user.email,
        ...passwordChangedEmail(user.name),
      })
      if (!result.ok) {
        securityLogger.warn(
          { userId: user.id, retryable: result.retryable, error: result.error },
          'password change confirmation email could not be delivered',
        )
      }
    },
  },

  session: {
    expiresIn: SESSION_MAX_AGE_SECONDS,
    updateAge: SESSION_REFRESH_SECONDS,
  },

  advanced: {
    database: {
      generateId: () => newId(),
    },
    cookiePrefix: 'arkham',
    useSecureCookies: isProduction,
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    },
  },

  trustedOrigins: env.ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => (origin.startsWith('http') ? origin : `https://${origin}`))
    .concat(env.BETTER_AUTH_URL),

  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/request-password-reset': { window: 300, max: 3 },
      '/reset-password': { window: 300, max: 5 },
    },
  },

  user: {
    additionalFields: {
      status: { type: 'string', required: false, input: false },
      timezone: { type: 'string', required: false, input: false },
      locale: { type: 'string', required: false, input: false },
    },
  },

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const scope = THROTTLED_PATHS[ctx.path]
      if (!scope) return

      const email = (ctx.body as { email?: unknown } | undefined)?.email
      if (typeof email !== 'string' || email.length === 0) return

      const decision = await consumeAttempt(scope, email)
      if (decision.allowed) return

      throw new APIError('TOO_MANY_REQUESTS', {
        message: 'Too many attempts. Try again later.',
        code: 'TOO_MANY_ATTEMPTS',
        retryAfter: decision.retryAfterSeconds,
      })
    }),

    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-in/email') return

      const email = (ctx.body as { email?: unknown } | undefined)?.email
      if (typeof email === 'string' && ctx.context.newSession) {
        await clearAttempts('signin', email)
      }
    }),
  },

  plugins: [admin({ defaultRole: 'user', adminRoles: ['admin'] }), nextCookies()],
})

export type Auth = typeof auth
