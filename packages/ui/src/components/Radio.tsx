import { forwardRef } from 'react';
import { cn } from '../lib/cn';

export interface RadioProps extends React.InputHTMLAttributes<HTMLInputElement> {
  children?: React.ReactNode;
}

/** Carbon radio — 18px ring, 8px inner dot when selected. */
export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <label
        className={cn(
          'inline-flex items-center gap-03 cursor-pointer',
          'font-sans text-sm leading-5 text-text-primary',
          className,
        )}
      >
        <span className="relative inline-flex h-[18px] w-[18px] flex-[0_0_auto]">
          <input
            ref={ref}
            type="radio"
            className="peer absolute inset-0 m-0 cursor-pointer opacity-0"
            {...props}
          />
          <span className="pointer-events-none absolute inset-0 rounded-pill border border-gray-100 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-focus peer-focus-visible:outline-offset-1" />
          <span className="pointer-events-none absolute inset-0 m-auto h-2 w-2 rounded-pill bg-gray-100 opacity-0 peer-checked:opacity-100" />
        </span>
        {children}
      </label>
    );
  },
);
Radio.displayName = 'Radio';
