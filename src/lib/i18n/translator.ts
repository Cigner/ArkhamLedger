import { createTranslator } from 'next-intl'
import en from '@/messages/en.json'
import type { Locale } from './locales'

export type AppTranslator = (key: string, values?: Record<string, string | number | Date>) => string

const catalogs = { en } as const

/** Creates a request-independent translator for workers and other background processes. */
export function createAppTranslator(locale: Locale): AppTranslator {
  const translate = createTranslator({ locale, messages: catalogs[locale] })

  return (key, values) => translate(key as never, values as never)
}
