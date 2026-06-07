'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Icon } from '../icons/Icon';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  /** Custom cell renderer; falls back to String(row[key]). */
  render?: (row: T) => ReactNode;
  /** Value used for sorting when different from the rendered cell. */
  sortValue?: (row: T) => string | number;
  className?: string;
}

export interface DataTableProps<T> {
  title?: string;
  columns: Array<Column<T>>;
  rows: T[];
  getRowId: (row: T) => string;
  selectedId?: string;
  onRowClick?: (row: T) => void;
  /** Right-aligned toolbar actions (buttons, overflow, etc.). */
  toolbar?: ReactNode;
  className?: string;
}

type SortDir = 'asc' | 'desc';

/** Carbon data table — toolbar, sortable headers, hover + selected rows. */
export function DataTable<T>({
  title,
  columns,
  rows,
  getRowId,
  selectedId,
  onRowClick,
  toolbar,
  className,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows;
    const val = (r: T): string | number =>
      col.sortValue
        ? col.sortValue(r)
        : ((r as Record<string, unknown>)[sortKey] as string | number);
    return [...rows].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, columns, sortKey, sortDir]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  return (
    <div className={cn('bg-layer-02 border border-border-subtle-01', className)}>
      {(title || toolbar) && (
        <div className="h-12 flex items-center justify-between pl-05 pr-03 border-b border-border-subtle-01">
          {title ? (
            <div className="font-sans text-base font-semibold leading-[1.375rem] text-text-primary">
              {title}
            </div>
          ) : (
            <span />
          )}
          {toolbar ? <div className="flex items-center gap-[2px]">{toolbar}</div> : null}
        </div>
      )}
      <div className="overflow-x-auto">
      <table className="w-full border-collapse min-w-[720px]">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                className={cn(
                  'h-control-md bg-gray-20 text-left px-05 whitespace-nowrap',
                  'font-sans text-xs font-semibold leading-4 tracking-[0.16px] text-text-primary',
                  col.sortable && 'cursor-pointer',
                  col.className,
                )}
              >
                <span className="inline-flex items-center gap-[6px]">
                  {col.header}
                  {col.sortable && sortKey === col.key ? (
                    <Icon name={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'} size={16} />
                  ) : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const id = getRowId(row);
            const selected = selectedId === id;
            return (
              <tr
                key={id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'group',
                  onRowClick && 'cursor-pointer',
                  selected ? 'bg-blue-10' : 'hover:bg-layer-01',
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'h-control-lg border-b border-border-subtle-01 px-05',
                      'font-sans text-sm leading-[18px] text-text-primary',
                      col.className,
                    )}
                  >
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
