import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface FieldProps {
  label?: ReactNode;
  helper?: ReactNode;
  /** When set, the field renders in its error state (red label + helper). */
  error?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

/** Label + control + helper/error text, in the Carbon field layout. */
export function Field({ label, helper, error, htmlFor, children, className }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-03', className)}>
      {label ? (
        <label
          htmlFor={htmlFor}
          className={cn(
            'font-sans text-xs leading-4 tracking-[0.32px]',
            error ? 'text-text-error' : 'text-text-secondary',
          )}
        >
          {label}
        </label>
      ) : null}
      {children}
      {helper || error ? (
        <span
          className={cn(
            'font-sans text-xs leading-4 tracking-[0.32px]',
            error ? 'text-text-error' : 'text-text-helper',
          )}
        >
          {error || helper}
        </span>
      ) : null}
    </div>
  );
}
