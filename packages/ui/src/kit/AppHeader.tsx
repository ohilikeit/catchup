import { cn } from '../lib/cn';
import { Icon } from '../icons/Icon';

export interface AppHeaderProps {
  /** Product nav items shown in the header bar. */
  nav?: string[];
  active?: string;
  onNav?: (item: string) => void;
  onMenu?: () => void;
  /** Click the brand/logo (e.g. go to home). When set, the brand becomes interactive. */
  onBrand?: () => void;
  /** Brand label; the second word is emphasized (e.g. "CatchUP Console"). */
  brand?: [string, string];
  /** Avatar initials. */
  user?: string;
}

/**
 * Carbon UI Shell global header — black bar, 48px tall, product nav with a blue
 * underline on the active item, icon actions, and an avatar.
 */
export function AppHeader({
  nav = [],
  active,
  onNav,
  onMenu,
  onBrand,
  brand = ['CatchUP', 'Console'],
  user = 'CU',
}: AppHeaderProps) {
  const hbtn =
    'w-12 h-12 flex items-center justify-center text-gray-30 bg-transparent border-0 cursor-pointer hover:bg-[#2c2c2c] hover:text-white';
  return (
    <header className="relative z-20 h-12 flex items-center bg-gray-100 text-white border-b border-[#393939]">
      <button className={hbtn} onClick={onMenu} aria-label="Open menu">
        <Icon name="menu" size={20} />
      </button>
      <button
        type="button"
        onClick={onBrand}
        disabled={!onBrand}
        aria-label={onBrand ? '메인으로' : undefined}
        className={cn(
          'px-05 font-sans text-sm leading-none text-white whitespace-nowrap tracking-[0.1px] bg-transparent border-0',
          onBrand ? 'cursor-pointer hover:text-gray-30' : 'cursor-default',
        )}
      >
        {brand[0]} <b className="font-semibold">{brand[1]}</b>
      </button>
      <nav className="flex h-full">
        {nav.map((n) => (
          <a
            key={n}
            onClick={() => onNav?.(n)}
            className={cn(
              'flex items-center px-05 h-full font-sans text-sm leading-none text-gray-30 no-underline cursor-pointer border-b-2 border-transparent hover:bg-[#2c2c2c] hover:text-white',
              active === n && 'text-white border-blue-60',
            )}
          >
            {n}
          </a>
        ))}
      </nav>
      <div className="flex-1" />
      <button className={hbtn} aria-label="Search">
        <Icon name="search" size={20} />
      </button>
      <button className={hbtn} aria-label="Notifications">
        <Icon name="notification" size={20} />
      </button>
      <button className={hbtn} aria-label="Help">
        <Icon name="help" size={20} />
      </button>
      <button className={cn(hbtn, 'w-12')} aria-label="Account">
        <span className="w-8 h-8 rounded-pill bg-blue-60 text-white flex items-center justify-center font-sans text-xs font-semibold leading-none">
          {user}
        </span>
      </button>
    </header>
  );
}
