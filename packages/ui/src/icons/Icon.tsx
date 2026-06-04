import type { CSSProperties, SVGProps } from 'react';
import { CARBON_ICONS, type IconName } from './glyphs';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  /** Pixel size; defaults to 16 (Carbon's UI default). */
  size?: number;
  /** Accessible label. When omitted the icon is aria-hidden (decorative). */
  title?: string;
}

/**
 * Inline-SVG Carbon glyph. Color inherits via `currentColor`, so set color
 * with Tailwind text utilities (e.g. `text-support-error`) or `style.color`.
 */
export function Icon({ name, size = 16, title, style, ...rest }: IconProps) {
  const d = CARBON_ICONS[name];
  if (!d) return null;
  const mergedStyle: CSSProperties = {
    display: 'inline-block',
    verticalAlign: 'middle',
    flex: '0 0 auto',
    ...style,
  };
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      focusable="false"
      style={mergedStyle}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      <path d={d} />
    </svg>
  );
}
