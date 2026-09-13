import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Class name merge helper.
 *
 * Resolves conditional classes and then lets later Tailwind utilities win over
 * earlier ones in the same group, so a caller can override a component's default
 * spacing or colour without fighting specificity.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
