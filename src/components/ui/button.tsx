import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

/**
 * Button.
 *
 * Deliberately flat: no gradients, minimal radius, weight carried by colour and
 * border rather than by depth. The focus ring is not declared here — the global
 * :focus-visible rule renders a two-tone ring that stays visible over the
 * availability heatmap, where a single-tone ring would disappear.
 *
 * The `danger` variant is for destructive actions; `accent` is the default
 * affirmative action and is the only variant using the solid oxblood fill,
 * which is why it is the only one that needs the light-on-accent foreground.
 */
const buttonVariants = cva(
  [
    'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap',
    'font-ui font-medium tracking-[0.01em]',
    'rounded-md border border-transparent',
    'transition-interactive',
    'disabled:pointer-events-none disabled:opacity-45',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        accent:
          'border-accent-solid bg-accent-solid text-text-on-accent hover:border-accent-hover hover:bg-accent-hover active:brightness-90',
        outline:
          'border-border-default bg-surface-raised text-text-primary hover:border-border-strong hover:bg-surface-hover active:bg-surface-active',
        ghost:
          'text-text-secondary hover:bg-surface-hover hover:text-text-primary active:bg-surface-active',
        danger:
          'border-status-danger/60 bg-transparent text-status-danger hover:border-status-danger hover:bg-sanguine-3 active:bg-sanguine-4',
        link: 'text-accent-text underline-offset-4 hover:underline active:opacity-80',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-5 text-base',
        icon: 'size-10',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: { variant: 'outline', size: 'md' },
  },
)

export type ButtonProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants>

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { buttonVariants }
