/* @app/ui — CatchUP design system (Carbon foundations).
   Import components from here; import tokens.css once at the app root. */

// Utilities
export { cn } from './lib/cn';

// Icons
export { Icon, type IconProps } from './icons/Icon';
export {
  CARBON_ICONS,
  STATUS_ICON,
  type IconName,
  type StatusKind,
} from './icons/glyphs';

// Primitives
export { Button, buttonVariants, type ButtonProps } from './components/Button';
export { Field, type FieldProps } from './components/Field';
export { Input, type InputProps } from './components/Input';
export { Select, type SelectProps } from './components/Select';
export { Checkbox, type CheckboxProps } from './components/Checkbox';
export { Radio, type RadioProps } from './components/Radio';
export { Toggle, type ToggleProps } from './components/Toggle';
export { Tag, tagVariants, type TagProps } from './components/Tag';
export {
  Notification,
  notifVariants,
  type NotificationProps,
} from './components/Notification';
export { Tile, type TileProps } from './components/Tile';
export {
  Skeleton,
  SkeletonText,
  type SkeletonProps,
  type SkeletonTextProps,
} from './components/Skeleton';
export { Menu, type MenuProps, type MenuItem } from './components/Menu';
export { Link, type LinkProps } from './components/Link';

// Console UI-kit (composed)
export { AppHeader, type AppHeaderProps } from './kit/AppHeader';
export { SideNav, type SideNavProps, type SideNavItem } from './kit/SideNav';
export { Modal, type ModalProps } from './kit/Modal';
export { Breadcrumb, type BreadcrumbProps, type Crumb } from './kit/Breadcrumb';
export {
  MetricTile,
  MetricGrid,
  type MetricTileProps,
} from './kit/MetricTile';
export { DataTable, type DataTableProps, type Column } from './kit/DataTable';
