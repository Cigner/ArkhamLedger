import { cn } from '@/lib/cn'

/**
 * Data table.
 *
 * Horizontal rules only, no zebra striping — rows separate by rule the way a
 * ledger does. The wrapper scrolls independently so a wide table never forces
 * the page body to scroll sideways.
 */
export function TableContainer({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="table-container"
      className={cn('w-full overflow-x-auto', className)}
      {...props}
    />
  )
}

export function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <table
      data-slot="table"
      className={cn('w-full caption-bottom border-collapse font-ui text-sm', className)}
      {...props}
    />
  )
}

export function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn('border-b border-border-default', className)}
      {...props}
    />
  )
}

export function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={cn(className)} {...props} />
}

export function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b border-border-subtle transition-interactive last:border-0 hover:bg-surface-hover',
        className,
      )}
      {...props}
    />
  )
}

export function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'px-4 py-2.5 text-left align-middle',
        'text-2xs font-medium uppercase tracking-[--tracking-smallcaps] text-text-secondary',
        className,
      )}
      {...props}
    />
  )
}

export function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn('px-4 py-3 align-middle text-text-primary', className)}
      {...props}
    />
  )
}

export function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-3 text-xs text-text-muted', className)}
      {...props}
    />
  )
}
