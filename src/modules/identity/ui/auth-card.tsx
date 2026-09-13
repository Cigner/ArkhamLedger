import { cn } from '@/lib/cn'

/**
 * Shell for the unauthenticated forms.
 *
 * Shared so sign-in, activation and password reset are visually identical: a
 * user moving between them should never wonder whether they have left the
 * application.
 */
export function AuthCard({
  title,
  description,
  children,
  footer,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'ornament-corners relative rounded-lg border border-border-subtle bg-surface-raised px-6 py-7',
        className,
      )}
    >
      <h1 className="font-display text-xl leading-[--leading-tight] tracking-[--tracking-display] text-text-primary">
        {title}
      </h1>
      {description ? (
        <p className="mt-2 font-ui text-sm leading-[--leading-ui] text-text-secondary">
          {description}
        </p>
      ) : null}
      <div className="mt-6">{children}</div>
      {footer ? (
        <div className="mt-6 border-t border-border-subtle pt-4 text-center font-ui text-xs text-text-muted">
          {footer}
        </div>
      ) : null}
    </div>
  )
}
