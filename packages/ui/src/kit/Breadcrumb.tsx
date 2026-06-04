import { Fragment } from 'react';
import { cn } from '../lib/cn';

export interface Crumb {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface BreadcrumbProps {
  items: Crumb[];
  className?: string;
}

/** Carbon breadcrumb — slash-separated trail, links in interactive blue. */
export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        'flex items-center gap-03 font-sans text-sm leading-[18px] text-text-secondary',
        className,
      )}
    >
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <Fragment key={c.label}>
            {last ? (
              <span aria-current="page">{c.label}</span>
            ) : (
              <a
                href={c.href}
                onClick={c.onClick}
                className="text-link-primary no-underline cursor-pointer hover:underline"
              >
                {c.label}
              </a>
            )}
            {!last && <span className="text-text-placeholder">/</span>}
          </Fragment>
        );
      })}
    </nav>
  );
}
