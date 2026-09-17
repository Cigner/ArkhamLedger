import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import { Cinzel, IM_Fell_English, Inter, Spectral } from 'next/font/google'
import '@/design-system/globals.css'

/**
 * Root layout.
 *
 * Fonts are loaded through next/font so they are self-hosted and hashed at build
 * time: no request leaves the deployment for a stylesheet, which keeps the
 * content security policy free of external font origins.
 */
const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-cinzel',
  display: 'swap',
})

const spectral = Spectral({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '600'],
  variable: '--font-spectral',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
  display: 'swap',
})

const imFell = IM_Fell_English({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-im-fell',
  display: 'swap',
})

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return {
    title: {
      default: t('common.appName'),
      template: `%s · ${t('common.appName')}`,
    },
    description: t('metadata.description'),
    icons: {
      icon: '/brand/logo.ico',
      shortcut: '/brand/logo.ico',
      apple: '/brand/logo.png',
    },
    robots: { index: false, follow: false },
  }
}

export const viewport: Viewport = {
  themeColor: '#0e100c',
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()])

  return (
    <html
      // en-GB rather than en: it is what every formatted date in the
      // application uses, and Firefox follows it for native date inputs too.
      lang={locale === 'en' ? 'en-GB' : locale}
      className={`${cinzel.variable} ${spectral.variable} ${inter.variable} ${imFell.variable}`}
    >
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
