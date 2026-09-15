'use client'

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import { cn } from '@/lib/cn'

/**
 * Tabs.
 *
 * The active tab is marked by a brass underline and a weight change, not by
 * colour alone. Panels carry no padding so callers control their own rhythm.
 */
export const Tabs = TabsPrimitive.Root

export function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn('flex items-center gap-1 border-b border-border-subtle', className)}
      {...props}
    />
  )
}

export function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        'relative -mb-px cursor-pointer border-b-2 border-transparent px-3 py-2',
        'font-ui text-sm text-text-secondary transition-interactive',
        'hover:text-text-primary active:text-text-primary',
        // Base UI marks the active tab with data-active, not data-selected;
        // the latter silently matches nothing and leaves every tab looking idle.
        'data-[active]:border-candle-9 data-[active]:font-medium data-[active]:text-text-primary',
        className,
      )}
      {...props}
    />
  )
}

export function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel data-slot="tabs-content" className={cn(className)} {...props} />
}
