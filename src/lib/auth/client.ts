'use client'

import { createAuthClient } from 'better-auth/react'
import { adminClient } from 'better-auth/client/plugins'

/**
 * Browser-side auth client.
 *
 * Kept inside lib/auth alongside the server configuration so that both halves of
 * the auth library live behind the same boundary;
 *
 * Only the operations a browser genuinely needs are re-exported. Everything that
 * changes another user's account goes through a Server Action instead, where it
 * can be authorized and audited.
 */
const client = createAuthClient({
  plugins: [adminClient()],
})

export const signIn = client.signIn
export const signOut = client.signOut
export const requestPasswordReset = client.requestPasswordReset
export const resetPassword = client.resetPassword
export const useSession = client.useSession
