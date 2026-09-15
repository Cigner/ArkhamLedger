import { cn } from '@/lib/cn'

/**
 * Card.
 *
 * The primary container. Elevation comes from a lighter surface plus an alpha
 * border, not from a shadow, which is invisible against a near-black ground.
 *
 * The optional ornament variant draws brass corner rules through pseudo
 * elements; it is decoration and never the sole indicator of a state.
 */
export function Card({
  className,
  ornamented = false,
  ...props
}: React.ComponentProps<'div'> & { ornamented?: boolean }) {
  return (
    <div
      data-slot="card"
      data-ornamented={ornamented || undefined}
      className={cn(
        'relative rounded-lg border border-border-subtle bg-surface-raised',
        ornamented && 'ornament-corners',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-col gap-1 border-b border-border-subtle px-5 py-4', className)}
      {...props}
    />
  )
}

/**
 * A card's heading.
 *
 * Rendered as an h2, one level below the page's h1. It was an h3, which made
 * every page skip a level - a screen reader user navigating by heading hears a
 * gap and has to wonder what they missed.
 */
export function CardTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return (
    <h2
      data-slot="card-title"
      className={cn(
        'font-display text-lg leading-[--leading-tight] tracking-[--tracking-display] text-text-primary',
        className,
      )}
      {...props}
    />
  )
}

export function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="card-description"
      className={cn('font-ui text-sm leading-[--leading-ui] text-text-secondary', className)}
      {...props}
    />
  )
}

export function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-5 py-4', className)} {...props} />
}

export function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center gap-2 border-t border-border-subtle px-5 py-3', className)}
      {...props}
    />
  )
}
