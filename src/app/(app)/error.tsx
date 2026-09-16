'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('httpErrors.unexpected')

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error)
  }, [error])

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 font-ui text-sm text-text-secondary">
        <p>{t('description')}</p>
        {error.digest ? (
          <p className="text-text-muted">
            {t('reference')} <code className="font-mono text-xs">{error.digest}</code>
          </p>
        ) : null}
        <Button variant="outline" onClick={reset}>
          {t('action')}
        </Button>
      </CardContent>
    </Card>
  )
}
