'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Boundary for genuine failures inside the application.
 *
 * Refused permissions never reach here — those are interrupts handled by
 * forbidden.tsx and not-found.tsx — so anything that does is unexpected, and the
 * digest is the only thing that ties what the user saw to what the server logged.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error)
  }, [error])

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Something went wrong</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 font-ui text-sm text-text-secondary">
        <p>The page could not be loaded. Trying again often works.</p>
        {error.digest ? (
          <p className="text-text-muted">
            Reference: <code className="font-mono text-xs">{error.digest}</code>
          </p>
        ) : null}
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
      </CardContent>
    </Card>
  )
}
