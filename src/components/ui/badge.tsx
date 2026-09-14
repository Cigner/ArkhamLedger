import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

/**
 * Status badge.
 *
 * Every variant pairs a colour with its own text, so the status is legible
 * without distinguishing hues. Session statuses map onto these variants in
 * modules/sessions/ui rather than here, to keep this file free of domain
 * vocabulary.
 */
const badgeVariants = cva(
  [
    'inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5',
    'font-ui text-2xs font-medium uppercase tracking-[--tracking-smallcaps] whitespace-nowrap',
  ],
  {
    variants: {
      variant: {
        neutral: 'border-border-default bg-surface-subtle text-text-secondary',
        accent: 'border-transparent bg-accent-solid text-text-on-accent',
        candle: 'border-candle-8 bg-candle-3 text-candle-11',
        positive: 'border-status-positive/50 bg-transparent text-status-positive',
        warning: 'border-status-warning/50 bg-transparent text-status-warning',
        danger: 'border-status-danger/50 bg-transparent text-status-danger',
        muted: 'border-border-subtle bg-transparent text-text-muted',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
)

export type BadgeProps = React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { badgeVariants }
