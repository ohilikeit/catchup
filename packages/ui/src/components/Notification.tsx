import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';
import { Icon } from '../icons/Icon';
import { STATUS_ICON, type StatusKind } from '../icons/glyphs';

const notifVariants = cva(
  'flex items-start gap-04 py-[14px] pr-[14px] pl-[13px] border-l-[3px] max-w-full',
  {
    variants: {
      kind: {
        error: 'border-support-error bg-notification-error',
        success: 'border-support-success bg-notification-success',
        warning: 'border-support-warning bg-notification-warning',
        info: 'border-support-info bg-notification-info',
      },
    },
    defaultVariants: { kind: 'info' },
  },
);

const ICON_COLOR: Record<StatusKind, string> = {
  error: 'text-support-error',
  success: 'text-support-success',
  warning: 'text-gray-100',
  info: 'text-support-info',
};

export interface NotificationProps extends VariantProps<typeof notifVariants> {
  title?: React.ReactNode;
  children?: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

/** Carbon inline/toast notification — filled status icon + factual copy. */
export function Notification({ kind = 'info', title, children, onClose, className }: NotificationProps) {
  const k = (kind ?? 'info') as StatusKind;
  return (
    <div role="status" className={cn(notifVariants({ kind }), className)}>
      <span className={cn('mt-[1px] flex-[0_0_auto]', ICON_COLOR[k])}>
        <Icon name={STATUS_ICON[k]} size={16} />
      </span>
      <div className="font-sans text-sm leading-5 text-text-primary">
        {title ? <b className="font-semibold">{title} </b> : null}
        {children}
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ml-auto cursor-pointer text-icon-primary"
        >
          <Icon name="close" size={16} />
        </button>
      ) : null}
    </div>
  );
}

export { notifVariants };
