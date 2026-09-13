import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins/admin'
import { nextCookies } from 'better-auth/next-js'
import { db } from '@/db/client'
import * as schema from '@/db/schema'
import { env, isProduction } from '@/lib/env'
import { newId } from '@/lib/ids'

/**
 * Authentication instance.
 *
 * This module is the only place in the codebase that touches the auth library
 * directly; everything else goes through the port in ./port.ts. The indirection
 * exists because this library has a history of breaking minor releases, and a
 * wrapper confines such an upgrade to one file instead of every call site.
 *
 * Sessions are stored in the database rather than issued as stateless tokens so
 * that disabling an account or changing a password revokes access immediately.
 *
 * Table names are mapped explicitly: the library's default `session` would
 * collide with the domain's own notion of a session (a game session).
 */
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const SESSION_REFRESH_SECONDS = 60 * 60 * 24

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
    // There is no public sign-up: accounts are created by an administrator.
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    requireEmailVerification: false,
  },

  session: {
    expiresIn: SESSION_MAX_AGE_SECONDS,
    updateAge: SESSION_REFRESH_SECONDS,
  },

  advanced: {
    database: {
      // The library would otherwise mint its own 32-character ids. Using the
      // application generator keeps one identifier format across every table,
      // so foreign keys, column widths and id validation stay uniform.
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

  // Origin allowlist for the library's own CSRF checks; mirrors the Server
  // Action allowlist in next.config.ts.
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
      // Credential endpoints are throttled far harder than the default.
      '/sign-in/email': { window: 60, max: 5 },
      '/forget-password': { window: 300, max: 3 },
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

  plugins: [
    admin({ defaultRole: 'user', adminRoles: ['admin'] }),
    // Must stay last: it flushes Set-Cookie headers from Server Actions.
    nextCookies(),
  ],
})

export type Auth = typeof auth
