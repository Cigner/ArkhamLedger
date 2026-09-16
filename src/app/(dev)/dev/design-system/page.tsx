import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
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
const BADGE_VARIANTS = [
  'neutral',
  'accent',
  'candle',
  'positive',
  'warning',
  'danger',
  'muted',
] as const
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

export default async function DesignSystemPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  const t = await getTranslations('designSystem')

  return (
    <main className="relative z-10 mx-auto flex max-w-4xl flex-col gap-12 px-6 py-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={<Badge variant="candle">{t('dev')}</Badge>}
      />

      <Section title={t('typography.title')}>
        <div className="flex flex-col gap-3">
          <p className="font-display text-4xl tracking-[--tracking-display]">
            {t('typography.display')}
          </p>
          <p className="font-ornament text-2xl text-text-secondary">{t('typography.ornament')}</p>
          <p className="max-w-prose font-body text-base text-text-primary">
            {t('typography.body')}
          </p>
          <p className="font-ui text-sm text-text-secondary">{t('typography.interface')}</p>
          <p data-tabular className="font-ui text-sm text-text-muted">
            18:00 · 19:00 · 20:00 · 111 · 000
          </p>
        </div>
      </Section>

      <Section title={t('surfaces')}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SURFACE_TOKENS.map((name) => (
            <div
              key={name}
              className="rounded-lg border border-border-subtle p-4 font-ui text-xs text-text-secondary"
              style={{ background: `var(--color-surface-${name})` }}
            >
              {t('surfaceToken', { name })}
            </div>
          ))}
        </div>
      </Section>

      <Section title={t('buttons.title')}>
        <div className="flex flex-wrap items-center gap-3">
          {BUTTON_VARIANTS.map((variant) => (
            <Button key={variant} variant={variant}>
              {t(`buttons.variants.${variant}`)}
            </Button>
          ))}
          <Button variant="accent" disabled>
            {t('buttons.disabled')}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">{t('buttons.small')}</Button>
          <Button size="md">{t('buttons.medium')}</Button>
          <Button size="lg">{t('buttons.large')}</Button>
        </div>
      </Section>

      <Section title={t('badges.title')}>
        <div className="flex flex-wrap items-center gap-2">
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant}>
              {t(`badges.variants.${variant}`)}
            </Badge>
          ))}
        </div>
      </Section>

      <Section title={t('forms.title')}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel>{t('forms.campaignName')}</FieldLabel>
            <Input placeholder={t('forms.campaignPlaceholder')} />
            <FieldDescription>{t('forms.campaignHint')}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>{t('forms.invalid')}</FieldLabel>
            <Input defaultValue="x" data-invalid="" />
            <FieldError>{t('forms.invalidMessage')}</FieldError>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel>{t('forms.description')}</FieldLabel>
            <Textarea placeholder={t('forms.descriptionPlaceholder')} />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <Checkbox id="ds-check" defaultChecked />
          <label htmlFor="ds-check" className="font-ui text-sm text-text-primary">
            {t('forms.checked')}
          </label>
          <Checkbox id="ds-check-2" />
          <label htmlFor="ds-check-2" className="font-ui text-sm text-text-primary">
            {t('forms.unchecked')}
          </label>
        </div>
      </Section>

      <DesignSystemInteractive />

      <Section title={t('availability.title')}>
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-secondary">
              {t('availability.states')}
            </p>
            <div className="flex gap-2">
              {(
                [
                  ['yes', '●', 'color-slot-yes'],
                  ['ifNeedBe', '◐', 'color-slot-if-need-be'],
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
                  <span>{t(`availability.labels.${label}`)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 font-ui text-xs uppercase tracking-[--tracking-smallcaps] text-text-secondary">
              {t('availability.density')}
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

      <Section title={t('cards.title')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('cards.campaign')}</CardTitle>
              <CardDescription>{t('cards.campaignDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="font-ui text-sm text-text-secondary">
              {t('cards.plain')}
            </CardContent>
            <CardFooter>
              <Button size="sm">{t('cards.open')}</Button>
            </CardFooter>
          </Card>
          <Card ornamented>
            <CardHeader>
              <CardTitle>{t('cards.ornamented')}</CardTitle>
              <CardDescription>{t('cards.ornamentedDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="font-ui text-sm text-text-secondary">
              {t('cards.contrast')}
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title={t('table.title')}>
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('table.session')}</TableHead>
                <TableHead>{t('table.status')}</TableHead>
                <TableHead>{t('table.date')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>{t('table.sessionNumber', { number: 12 })}</TableCell>
                <TableCell>
                  <Badge variant="positive">{t('table.scheduled')}</Badge>
                </TableCell>
                <TableCell data-tabular>{t('table.dateExample')}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>{t('table.sessionNumber', { number: 13 })}</TableCell>
                <TableCell>
                  <Badge variant="warning">{t('table.collecting')}</Badge>
                </TableCell>
                <TableCell className="text-text-muted">-</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Section>

      <Section title={t('states.title')}>
        <EmptyState
          title={t('states.emptyTitle')}
          description={t('states.emptyDescription')}
          action={<Button variant="accent">{t('states.createCampaign')}</Button>}
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
