import Link from 'next/link'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'
import { buttonVariants, type ButtonProps } from './button'

/**
 * A link styled as a button.
 *
 * Exists so the correct thing is also the easy thing. Passing a Link into
 * Button's `render` prop produces an anchor that still claims button semantics,
 * which Base UI warns about: it breaks form participation and misleads assistive
 * technology about what activating it will do.
 *
 * Navigation is a link. This renders a real anchor and only borrows the styling.
 */
export type ButtonLinkProps = ComponentProps<typeof Link> &
  Pick<ButtonProps, 'variant' | 'size'>

export function ButtonLink({ className, variant, size, ...props }: ButtonLinkProps) {
  return (
    <Link
      data-slot="button-link"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
