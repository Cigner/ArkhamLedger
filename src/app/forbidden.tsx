import { ButtonLink } from '@/components/ui/button-link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * 403.
 *
 * Reached when somebody is signed in and the thing exists, but is not theirs to
 * open — a Keeper-only screen viewed by an Investigator, most often, and the
 * administration area otherwise. Says so plainly rather than pretending the page
 * is missing, because they can already see that it is not.
 *
 * The wording names no campaign: this page is reached from the administration
 * area too, and "kept by somebody else" would be a confusing thing to read
 * about a screen that belongs to nobody.
 */
export default function ForbiddenPage() {
  return (
    <div className="relative z-10 flex min-h-dvh items-center justify-center px-4">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Not yours to open</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 font-ui text-sm text-text-secondary">
          <p>
            This part is kept by somebody else. If you think that is wrong, ask whoever runs it.
          </p>
          <ButtonLink variant="outline" href="/campaigns">
            Back to campaigns
          </ButtonLink>
        </CardContent>
      </Card>
    </div>
  )
}
