import { cn } from '../lib/cn';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/glyphs';

export interface SideNavItem {
  id: string;
  label: string;
  icon: IconName;
}

export interface SideNavProps {
  items: SideNavItem[];
  active?: string;
  onSelect?: (id: string) => void;
  collapsed?: boolean;
  category?: string;
}

/** Carbon side navigation — 256px panel, active item gets a 3px blue inset rule. */
export function SideNav({ items, active, onSelect, collapsed, category = 'Workspace' }: SideNavProps) {
  return (
    <aside
      className={cn(
        'w-64 flex-[0_0_auto] bg-layer-02 border-r border-border-subtle-01 overflow-y-auto',
        'transition-[margin] duration-moderate-01 ease-productive',
        collapsed && '-ml-64',
      )}
    >
      <div className="font-sans text-xs font-semibold leading-none tracking-[0.32px] text-text-secondary px-05 pt-05 pb-03">
        {category}
      </div>
      {items.map((it) => {
        const isActive = active === it.id;
        return (
          <div
            key={it.id}
            onClick={() => onSelect?.(it.id)}
            className={cn(
              'flex items-center gap-04 h-control-md px-05 cursor-pointer',
              'font-sans text-sm leading-none text-text-primary',
              'hover:bg-layer-hover-01',
              isActive
                ? 'bg-gray-20 font-semibold shadow-[inset_3px_0_0_0_var(--blue-60)]'
                : 'shadow-none',
            )}
          >
            <span className={isActive ? 'text-icon-primary' : 'text-icon-secondary'}>
              <Icon name={it.icon} size={16} />
            </span>
            {it.label}
          </div>
        );
      })}
    </aside>
  );
}
