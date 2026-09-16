export const LOCALES = ['en'] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

export function isSupportedLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value)
}
