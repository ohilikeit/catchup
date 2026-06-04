import { cn } from '../lib/cn';

export interface TileProps extends React.HTMLAttributes<HTMLDivElement> {
  clickable?: boolean;
  selectable?: boolean;
  selected?: boolean;
}

/** Carbon tile — flat rectangle, square corners, no resting shadow. */
export function Tile({
  clickable,
  selectable,
  selected,
  className,
  children,
  ...props
}: TileProps) {
  return (
    <div
      className={cn(
        'bg-layer-01 border border-transparent p-05',
        clickable &&
          'cursor-pointer transition-colors duration-fast-02 ease-productive hover:bg-layer-hover-01',
        selectable && selected && 'outline outline-2 outline-focus -outline-offset-2',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
