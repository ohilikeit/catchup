import { forwardRef } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/glyphs';

const buttonVariants = cva(
  // Base — Carbon productive button: sharp, 1px border, color-only feedback.
  cn(
    'inline-flex items-center gap-07 whitespace-nowrap select-none',
    'border border-transparent px-05 font-sans text-sm leading-[1.125rem] tracking-[0.16px]',
    'cursor-pointer transition-colors duration-fast-02 ease-productive',
    'focus-visible:outline-none focus-visible:shadow-focus-inset',
    'disabled:cursor-not-allowed disabled:pointer-events-none',
  ),
  {
    variants: {
      kind: {
        primary:
          'bg-button-primary text-text-on-color hover:bg-button-primary-hover active:bg-button-primary-active disabled:bg-button-disabled disabled:text-text-on-color',
        secondary:
          'bg-button-secondary text-text-on-color hover:bg-button-secondary-hover active:bg-button-secondary-active disabled:bg-button-disabled disabled:text-text-on-color',
        tertiary:
          'bg-transparent text-button-tertiary border-button-tertiary hover:bg-button-primary-hover hover:border-button-primary-hover hover:text-text-on-color active:bg-button-primary-active active:border-button-primary-active active:text-text-on-color disabled:bg-transparent disabled:text-text-disabled disabled:border-gray-30',
        ghost:
          'bg-transparent text-link-primary hover:bg-background-hover active:bg-background-active disabled:bg-transparent disabled:text-text-disabled',
        danger:
          'bg-button-danger text-text-on-color hover:bg-button-danger-hover active:bg-button-danger-active disabled:bg-button-disabled disabled:text-text-on-color',
      },
      size: {
        lg: 'h-control-lg',
        field: 'h-control-md',
        sm: 'h-control-sm',
      },
      iconOnly: {
        true: 'justify-center gap-0 px-0',
        false: '',
      },
    },
    compoundVariants: [
      { iconOnly: true, size: 'lg', class: 'w-control-lg' },
      { iconOnly: true, size: 'field', class: 'w-control-md' },
      { iconOnly: true, size: 'sm', class: 'w-control-sm' },
    ],
    defaultVariants: { kind: 'primary', size: 'lg', iconOnly: false },
  },
);

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'>,
    VariantProps<typeof buttonVariants> {
  /** Trailing icon name (or the only glyph when `iconOnly`). */
  icon?: IconName;
  /** Render as the child element (e.g. an <a>/<Link>) keeping button styles. */
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, kind, size, iconOnly, icon, asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ kind, size, iconOnly }), className)}
        {...props}
      >
        {asChild ? (
          children
        ) : iconOnly && icon ? (
          <Icon name={icon} size={16} />
        ) : (
          <>
            {children}
            {icon ? <Icon name={icon} size={16} /> : null}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
