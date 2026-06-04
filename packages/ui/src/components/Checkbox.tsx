import { forwardRef } from 'react';
import { cn } from '../lib/cn';
import { Icon } from '../icons/Icon';

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  children?: React.ReactNode;
}

/** Carbon checkbox — 16px square, filled + white check when checked. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <label
        className={cn(
          'inline-flex items-start gap-03 cursor-pointer',
          'font-sans text-sm leading-5 text-text-primary',
          className,
        )}
      >
        {/* 16px control box; input/box/check share a parent so peer-checked reaches them. */}
        <span className="relative mt-[2px] inline-flex h-04 w-04 flex-[0_0_auto]">
          <input
            ref={ref}
            type="checkbox"
            className="peer absolute inset-0 m-0 cursor-pointer opacity-0"
            {...props}
          />
          <span className="pointer-events-none absolute inset-0 border border-gray-100 peer-checked:bg-gray-100 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-focus peer-focus-visible:outline-offset-1" />
          <Icon
            name="checkmark"
            size={12}
            className="pointer-events-none absolute inset-0 m-auto text-white opacity-0 peer-checked:opacity-100"
          />
        </span>
        {children}
      </label>
    );
  },
);
Checkbox.displayName = 'Checkbox';
