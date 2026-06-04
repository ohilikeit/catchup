import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * cn — the shadcn base utility.
 * clsx merges conditional class names; twMerge resolves Tailwind conflicts so
 * the last utility wins (`px-2 px-4` → `px-4`). Every component composes its
 * defaults with an incoming `className` through this so overrides are safe.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
