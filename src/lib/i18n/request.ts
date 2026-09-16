import { getRequestConfig } from 'next-intl/server'
import { DEFAULT_LOCALE, type Locale } from './locales'

export default getRequestConfig(async () => {
  const locale: Locale = DEFAULT_LOCALE
  const messages = (await import(`@/messages/${locale}.json`)) as { default: AbstractIntlMessages }

  return { locale, messages: messages.default }
})

type AbstractIntlMessages = Record<string, unknown>
