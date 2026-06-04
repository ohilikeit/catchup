import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/glyphs';

const tagVariants = cva(
  'inline-flex items-center gap-[6px] h-6 px-03 rounded-pill font-sans text-xs leading-none whitespace-nowrap',
  {
    variants: {
      color: {
        gray: 'bg-gray-20 text-gray-100',
        blue: 'bg-blue-20 text-blue-90',
        green: 'bg-green-10 text-green-60',
        red: 'bg-red-20 text-red-80',
        purple: 'bg-[#e8daff] text-[#491d8b]',
        teal: 'bg-[#9ef0f0] text-[#004144]',
      },
    },
    defaultVariants: { color: 'gray' },
  },
);

export interface TagProps extends VariantProps<typeof tagVariants> {
  icon?: IconName;
  children: React.ReactNode;
  /** When provided, renders a dismissible "filter" tag with a close affordance. */
  onDismiss?: () => void;
  className?: string;
}

export function Tag({ color, icon, children, onDismiss, className }: TagProps) {
  if (onDismiss) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-[6px] h-6 pl-03 pr-02 rounded-pill bg-gray-20 text-gray-100 font-sans text-xs leading-none whitespace-nowrap',
          className,
        )}
      >
        {children}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="inline-flex p-[2px] cursor-pointer text-gray-100 hover:bg-background-active rounded-pill"
        >
          <Icon name="close" size={14} />
        </button>
      </span>
    );
  }
  return (
    <span className={cn(tagVariants({ color }), className)}>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </span>
  );
}

export { tagVariants };
