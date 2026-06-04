import { cn } from '../lib/cn';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/glyphs';

export interface MetricTileProps {
  label: string;
  value: React.ReactNode;
  icon?: IconName;
  /** Optional delta line, e.g. "+12% this week". */
  delta?: string;
  trend?: 'up' | 'down';
}

/** A single dashboard metric. Compose several inside <MetricGrid>. */
export function MetricTile({ label, value, icon, delta, trend }: MetricTileProps) {
  return (
    <div className="bg-layer-02 p-05">
      <div className="flex items-center gap-[6px] font-sans text-xs leading-4 tracking-[0.32px] text-text-secondary">
        {icon ? <Icon name={icon} size={14} /> : null}
        {label}
      </div>
      <div className="mt-[10px] font-sans text-[2rem] font-light leading-10 text-text-primary">
        {value}
      </div>
      {delta ? (
        <div
          className={cn(
            'mt-02 flex items-center gap-02 font-sans text-xs leading-4',
            trend === 'up' && 'text-support-success',
            trend === 'down' && 'text-support-error',
            !trend && 'text-text-secondary',
          )}
        >
          {trend ? <Icon name={trend === 'up' ? 'arrow-up' : 'arrow-down'} size={14} /> : null}
          {delta}
        </div>
      ) : null}
    </div>
  );
}

/** Hairline grid wrapper (1px gaps form Carbon's divider lines). */
export function MetricGrid({
  children,
  columns = 4,
  className,
}: {
  children: React.ReactNode;
  columns?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('grid gap-px bg-border-subtle-01 border border-border-subtle-01', className)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}
