/**
 * Supported interface locales.
 *
 * Kept separate from the request configuration so that client components can
 * import the list without pulling in server-only modules.
 */
export const LOCALES = ['en'] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

export function isSupportedLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value)
}
