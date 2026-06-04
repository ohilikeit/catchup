import { forwardRef } from 'react';
import { cn } from '../lib/cn';
import { Icon } from '../icons/Icon';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options?: string[];
  lg?: boolean;
}

/** Carbon select — filled underline with a chevron affordance. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, lg, children, ...props }, ref) => {
    return (
      <div className="relative flex items-center">
        <select
          ref={ref}
          className={cn(
            'w-full appearance-none bg-field-01 border-0 border-b border-border-strong-01',
            'pl-05 pr-09 font-sans text-sm leading-[1.125rem] text-text-primary',
            lg ? 'h-control-lg' : 'h-control-md',
            'focus:outline focus:outline-2 focus:outline-focus focus:-outline-offset-2 focus:border-b-transparent',
            className,
          )}
          {...props}
        >
          {options ? options.map((o) => <option key={o}>{o}</option>) : children}
        </select>
        <span className="pointer-events-none absolute right-04 inline-flex text-icon-primary">
          <Icon name="chevron-down" size={16} />
        </span>
      </div>
    );
  },
);
Select.displayName = 'Select';
