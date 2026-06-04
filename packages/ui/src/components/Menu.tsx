import { cn } from '../lib/cn';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/glyphs';

export interface MenuItem {
  label: string;
  icon?: IconName;
  danger?: boolean;
  onSelect?: () => void;
}

export interface MenuProps {
  items: Array<MenuItem | 'separator'>;
  className?: string;
}

/** Carbon overflow / dropdown menu — floating layer (the only place shadows live). */
export function Menu({ items, className }: MenuProps) {
  return (
    <div
      role="menu"
      className={cn('bg-layer-02 shadow-menu min-w-[160px] py-0', className)}
    >
      {items.map((it, i) =>
        it === 'separator' ? (
          <div key={`sep-${i}`} className="h-px bg-border-subtle-01" role="separator" />
        ) : (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            onClick={it.onSelect}
            className={cn(
              'flex h-control-md w-full items-center gap-03 px-05 text-left',
              'font-sans text-sm leading-[1.125rem] cursor-pointer hover:bg-layer-hover-01',
              it.danger ? 'text-text-error' : 'text-text-primary',
            )}
          >
            {it.icon ? <Icon name={it.icon} size={16} /> : null}
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}
