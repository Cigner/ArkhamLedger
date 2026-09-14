import { ButtonLink } from '@/components/ui/button-link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * 401.
 *
 * A session that has expired or been revoked mid-visit. Distinct from 403: the
 * fix here is to sign in again, not to ask somebody for access.
 */
export default function UnauthorizedPage() {
  return (
    <div className="relative z-10 flex min-h-dvh items-center justify-center px-4">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>You have been signed out</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 font-ui text-sm text-text-secondary">
          <p>Your session has ended. Sign in again to carry on.</p>
          <ButtonLink variant="accent" href="/sign-in">
            Sign in
          </ButtonLink>
        </CardContent>
      </Card>
    </div>
  )
}
