'use client';
import { cn } from '../lib/cn';
import { Icon } from '../icons/Icon';
import { Button } from '../components/Button';

export interface ModalProps {
  title: React.ReactNode;
  children?: React.ReactNode;
  onClose: () => void;
  onPrimary?: () => void;
  primaryLabel?: string;
  secondaryLabel?: string;
  /** Danger confirm — primary action becomes red. */
  danger?: boolean;
  className?: string;
}

/** Carbon modal — overlay + 480px panel, full-width 64px footer buttons. */
export function Modal({
  title,
  children,
  onClose,
  onPrimary,
  primaryLabel = 'Save',
  secondaryLabel = 'Cancel',
  danger,
  className,
}: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(22,22,22,0.5)]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'flex flex-col bg-layer-02 shadow-modal w-[480px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-64px)]',
          className,
        )}
      >
        <div className="flex items-start justify-between p-05 pb-0">
          <h2 className="m-0 font-sans text-xl leading-[1.625rem] font-normal text-text-primary">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center cursor-pointer text-icon-primary hover:bg-layer-hover-01"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="flex flex-col gap-05 px-05 pt-04 pb-07 overflow-y-auto">{children}</div>
        <div className="flex">
          <Button
            kind="secondary"
            onClick={onClose}
            className="flex-1 h-16 justify-start"
          >
            {secondaryLabel}
          </Button>
          <Button
            kind={danger ? 'danger' : 'primary'}
            onClick={onPrimary}
            className="flex-1 h-16 justify-start"
          >
            {primaryLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
