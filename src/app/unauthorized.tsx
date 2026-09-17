import { ButtonLink } from '@/components/ui/button-link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function UnauthorizedPage() {
  const t = await getTranslations('httpErrors.unauthorized')

  return (
    <div className="relative z-10 flex min-h-dvh items-center justify-center px-4">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 font-ui text-sm text-text-secondary">
          <p>{t('description')}</p>
          <ButtonLink variant="accent" href="/sign-in">
            {t('action')}
          </ButtonLink>
        </CardContent>
      </Card>
    </div>
  )
}
import { getTranslations } from 'next-intl/server'
