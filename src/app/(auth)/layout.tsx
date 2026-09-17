import Image from 'next/image'
import { getTranslations } from 'next-intl/server'

/**
 * Layout for the unauthenticated screens.
 *
 * A single centred card with no navigation: there is nowhere else to go until
 * the visitor has a session, and offering links would only invite them to
 * discover which routes exist.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('common')

  return (
    <div className="relative z-10 flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Image
            src="/brand/logo.png"
            width={144}
            height={144}
            alt=""
            priority
            className="mx-auto mb-4 size-36 object-contain"
          />
          <p className="font-display text-2xl tracking-[--tracking-display] text-text-primary">
            {t('appName')}
          </p>
          <p className="mt-1 font-ornament text-lg text-text-muted">{t('tagline')}</p>
        </div>
        {children}
      </div>
    </div>
  )
}
