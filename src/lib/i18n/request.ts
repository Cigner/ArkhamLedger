import { getRequestConfig } from 'next-intl/server'
import { DEFAULT_LOCALE, type Locale } from './locales'

/**
 * Message loading for server rendering.
 *
 * The interface ships in English only, but every string lives in a message
 * catalogue from day one: retrofitting translation later means touching every
 * component, whereas adding a catalogue is a single file.
 *
 * There is no locale segment in the URL — a single-locale deployment does not
 * need one, and adding it later is a routing change rather than a rewrite.
 */
export default getRequestConfig(async () => {
  const locale: Locale = DEFAULT_LOCALE
  const messages = (await import(`@/messages/${locale}.json`)) as { default: AbstractIntlMessages }

  return { locale, messages: messages.default }
})

type AbstractIntlMessages = Record<string, unknown>
