import { cn } from '@/lib/cn'

/**
 * Page header.
 *
 * One per screen. Keeps the title, optional description and primary actions in
 * a consistent place so that navigating between sections does not move the
 * user's eye, and so the heading level stays correct across the application.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        'flex flex-col gap-3 border-b border-border-subtle pb-5 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-2xl leading-[--leading-tight] tracking-[--tracking-display] text-text-primary">
          {title}
        </h1>
        {description ? (
          <p className="max-w-prose font-ui text-sm leading-[--leading-ui] text-text-secondary">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}
