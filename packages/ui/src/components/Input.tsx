import { forwardRef } from 'react';
import { cn } from '../lib/cn';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/glyphs';

const inputBase = cn(
  'w-full bg-field-01 border-0 border-b border-border-strong-01 px-05',
  'font-sans text-sm leading-[1.125rem] text-text-primary',
  'placeholder:text-text-placeholder',
  'transition-colors duration-fast-02 ease-productive',
  'focus:outline focus:outline-2 focus:outline-focus focus:-outline-offset-2 focus:border-b-transparent',
);

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Leading icon (rendered inside, left). */
  lead?: IconName;
  /** Trailing icon (rendered inside, right). */
  trail?: IconName;
  /** Large 48px height instead of the default 40px. */
  lg?: boolean;
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, lead, trail, lg, error, ...props }, ref) => {
    const input = (
      <input
        ref={ref}
        className={cn(
          inputBase,
          lg ? 'h-control-lg' : 'h-control-md',
          error && 'outline outline-2 outline-support-error -outline-offset-2 border-b-transparent',
          lead && 'pl-09',
          trail && 'pr-09',
          className,
        )}
        {...props}
      />
    );
    if (!lead && !trail) return input;
    return (
      <div className="relative flex items-center">
        {lead ? (
          <span className="absolute left-04 inline-flex text-icon-primary">
            <Icon name={lead} size={16} />
          </span>
        ) : null}
        {input}
        {trail ? (
          <span className="absolute right-04 inline-flex text-icon-primary">
            <Icon name={trail} size={16} />
          </span>
        ) : null}
      </div>
    );
  },
);
Input.displayName = 'Input';
