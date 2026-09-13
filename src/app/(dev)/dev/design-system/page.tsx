import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/patterns/empty-state'
import { PageHeader } from '@/components/patterns/page-header'
import { DesignSystemInteractive } from './interactive'

/**
 * Design system gallery.
 *
 * A development-only catalogue of every primitive in one place, so a token or
 * component change can be reviewed visually in seconds instead of by navigating
 * to whichever screen happens to use it. Returns 404 in production.
 */
export const dynamic = 'force-dynamic'

const BUTTON_VARIANTS = ['accent', 'outline', 'ghost', 'danger', 'link'] as const
const BADGE_VARIANTS = ['neutral', 'accent', 'candle', 'positive', 'warning', 'danger', 'muted'] as const
const SURFACE_TOKENS = ['canvas', 'subtle', 'raised', 'overlay', 'hover', 'active'] as const
const AVAIL_STEPS = [1, 2, 3, 4, 5] as const

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-lg tracking-[--tracking-display] text-text-primary">
        {title}
      </h2>
      {children}
    </section>
  )
}

export default function DesignSystemPage() {
  if (process.env.NODE_ENV === 'production') notFound()

  return (
    <main className="relative z-10 mx-auto flex max-w-4xl flex-col gap-12 px-6 py-10">
      <PageHeader
        title="Design system"
        description="Every primitive rendered against the real tokens. Development only."
        actions={<Badge variant="candle">dev</Badge>}
      />

      <Section title="Typography">
        <div className="flex flex-col gap-3">
          <p className="font-display text-4xl tracking-[--tracking-display]">Miskatonic</p>
          <p className="font-ornament text-2xl text-text-secondary">Ex Libris</p>
          <p className="max-w-prose font-body text-base text-text-primary">
            Body text in Spectral. The session ran long past midnight, and nobody wished to be the
            one who said so aloud.
          </p>
          <p className="font-ui text-sm text-text-secondary">
            Interface text in Inter — labels, tables and the availability grid.
          </p>
          <p data-tabular className="font-ui text-sm text-text-muted">
            18:00 · 19:00 · 20:00 · 111 · 000
          </p>
        </div>
      </Section>

      <Section title="Surfaces">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SURFACE_TOKENS.map((name) => (
            <div
              key={name}
              className="rounded-lg border border-border-subtle p-4 font-ui text-xs text-text-secondary"
              style={{ background: `var(--color-surface-${name})` }}
            >
              surface-{name}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          {BUTTON_VARIANTS.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          ))}
          <Button variant="accent" disabled>
            disabled
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">small</Button>
          <Button size="md">medium</Button>
          <Button size="lg">large</Button>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap items-center gap-2">
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </div>
      </Section>

      <Section title="Forms">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel>Campaign name</FieldLabel>
            <Input placeholder="The Haunting" />
            <FieldDescription>Shown to every member of the campaign.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Invalid example</FieldLabel>
            <Input defaultValue="x" data-invalid="" />
            <FieldError>A name must be at least three characters.</FieldError>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel>Description</FieldLabel>
            <Textarea placeholder="What the investigators know so far…" />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <Checkbox id="ds-check" defaultChecked />
          <label htmlFor="ds-check" className="font-ui text-sm text-text-primary">
            Checked
          </label>
          <Checkbox id="ds-check-2" />
          <label htmlFor="ds-check-2" className="font-ui text-sm text-text-primary">
            Unchecked
          </label>
        </div>
      </Section>

      <DesignSystemInteractive />

      <Section title="Availability palette">
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-secondary">
              Slot states — colour plus glyph, never colour alone
            </p>
            <div className="flex gap-2">
              {(
                [
                  ['yes', '●', 'color-slot-yes'],
                  ['if need be', '◐', 'color-slot-if-need-be'],
                  ['no', '✕', 'color-slot-no'],
                  ['empty', '', 'color-slot-empty'],
                ] as const
              ).map(([label, glyph, token]) => (
                <div
                  key={label}
                  className="flex h-12 w-24 flex-col items-center justify-center rounded-sm border border-border-subtle font-ui text-2xs text-text-on-candle"
                  style={{ background: `var(--${token})` }}
                >
                  <span aria-hidden="true">{glyph}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-secondary">
              Density ramp — the count is always printed
            </p>
            <div className="flex gap-1">
              {AVAIL_STEPS.map((step) => (
                <div
                  key={step}
                  data-tabular
                  className="flex h-12 w-16 items-center justify-center rounded-sm border border-border-subtle font-ui text-sm text-text-primary"
                  style={{ background: `var(--color-avail-${step})` }}
                >
                  {step}
                </div>
              ))}
              <div
                data-tabular
                className="flex h-12 w-16 items-center justify-center rounded-sm font-ui text-sm text-text-primary ring-2 ring-[--color-avail-best-ring]"
                style={{ background: 'var(--color-avail-5)' }}
              >
                ✦ 5
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Cards">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>The Haunting</CardTitle>
              <CardDescription>Four investigators · next session Thursday</CardDescription>
            </CardHeader>
            <CardContent className="font-ui text-sm text-text-secondary">
              A plain card on the raised surface.
            </CardContent>
            <CardFooter>
              <Button size="sm">Open</Button>
            </CardFooter>
          </Card>
          <Card ornamented>
            <CardHeader>
              <CardTitle>Ornamented</CardTitle>
              <CardDescription>Brass corner rules, decoration only</CardDescription>
            </CardHeader>
            <CardContent className="font-ui text-sm text-text-secondary">
              Hidden automatically under prefers-contrast: more.
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Table">
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Session 12</TableCell>
                <TableCell>
                  <Badge variant="positive">scheduled</Badge>
                </TableCell>
                <TableCell data-tabular>9 Oct, 18:00</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Session 13</TableCell>
                <TableCell>
                  <Badge variant="warning">collecting</Badge>
                </TableCell>
                <TableCell className="text-text-muted">—</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Section>

      <Section title="States">
        <EmptyState
          title="The archive is empty"
          description="No campaigns have been recorded yet."
          action={<Button variant="accent">Create campaign</Button>}
        />
        <Separator />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      </Section>
    </main>
  )
}
