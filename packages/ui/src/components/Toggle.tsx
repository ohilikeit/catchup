import { forwardRef } from 'react';
import { cn } from '../lib/cn';

export interface ToggleProps extends React.InputHTMLAttributes<HTMLInputElement> {
  children?: React.ReactNode;
}

/** Carbon toggle — 48×24 track, green when on (Green 50), 18px white knob. */
export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <label
        className={cn(
          'inline-flex items-center gap-04 cursor-pointer',
          'font-sans text-sm leading-[1.125rem] text-text-primary',
          className,
        )}
      >
        <span className="relative inline-flex h-6 w-12 flex-[0_0_auto]">
          <input
            ref={ref}
            type="checkbox"
            className="peer absolute inset-0 m-0 cursor-pointer opacity-0"
            {...props}
          />
          <span className="pointer-events-none absolute inset-0 rounded-pill bg-gray-50 transition-colors duration-moderate-01 ease-productive peer-checked:bg-support-success peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-focus peer-focus-visible:outline-offset-2" />
          <span className="pointer-events-none absolute left-[3px] top-[3px] h-[18px] w-[18px] rounded-pill bg-white transition-transform duration-moderate-01 ease-productive peer-checked:translate-x-6" />
        </span>
        {children}
      </label>
    );
  },
);
Toggle.displayName = 'Toggle';
