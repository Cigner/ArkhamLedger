import { ButtonLink } from '@/components/ui/button-link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * 404.
 *
 * Also what a campaign you are not a member of looks like. That is deliberate:
 * answering "forbidden" for somebody else's campaign would let its existence be
 * discovered by walking identifiers.
 */
export default function NotFoundPage() {
  return (
    <div className="relative z-10 flex min-h-dvh items-center justify-center px-4">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Nothing here</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 font-ui text-sm text-text-secondary">
          <p>That page does not exist, or it is not one of yours.</p>
          <ButtonLink variant="outline" href="/campaigns">
            Back to campaigns
          </ButtonLink>
        </CardContent>
      </Card>
    </div>
  )
}
