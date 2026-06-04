import { forwardRef } from 'react';
import { cn } from '../lib/cn';

export type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement>;

/** Carbon link — interactive blue, underline on hover. */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <a
        ref={ref}
        className={cn(
          'text-link-primary no-underline cursor-pointer hover:text-link-primary-hover hover:underline',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
          className,
        )}
        {...props}
      >
        {children}
      </a>
    );
  },
);
Link.displayName = 'Link';
