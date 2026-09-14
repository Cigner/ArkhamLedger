import 'server-only'
import { forbidden, notFound, unauthorized } from 'next/navigation'
import { ForbiddenError, NotFoundError, UnauthorizedError, isAppError } from '@/lib/errors'

/**
 * Bridges domain errors to HTTP semantics when rendering a page.
 *
 * The guards in the data layer throw typed errors because they are shared with
 * Server Actions, where an HTTP interrupt would be meaningless. A page needs the
 * opposite: an unhandled ForbiddenError renders as a 500, which tells the user
 * something broke when in fact the application worked exactly as intended.
 *
 * Only for Server Components. Calling this inside an action would abort the
 * action with a navigation signal instead of returning an error the form can
 * display.
 */
export async function guardPage<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch (error) {
    if (error instanceof UnauthorizedError) unauthorized()
    if (error instanceof ForbiddenError) forbidden()
    if (error instanceof NotFoundError) notFound()
    throw error
  }
}

/** True when the error is one the interrupts above already cover. */
export function isExpectedAccessError(error: unknown): boolean {
  return isAppError(error) && ['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND'].includes(error.code)
}
