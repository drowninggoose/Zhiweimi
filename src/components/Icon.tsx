import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'heart'
  | 'heart-filled'
  | 'flame'
  | 'pencil'
  | 'trash'
  | 'search'
  | 'plus'
  | 'up'
  | 'copy'
  | 'close'
  | 'check'
  | 'arrow-right'
  | 'home'
  | 'book'
  | 'pot'
  | 'camera'
  | 'calendar'
  | 'settings'
  | 'fridge'
  | 'bowl'
  | 'clock'
  | 'tag'
  | 'compass'
  | 'chart'
  | 'send'
  | 'mic';

const paths: Record<IconName, ReactNode> = {
  heart: (
    <path d="M12 20.3s-7.1-4.4-8.9-8.4C1.5 8.5 3.3 5.2 6.6 5.2c1.9 0 3.3 1 4.2 2.2 1-1.2 2.4-2.2 4.3-2.2 3.3 0 5.1 3.3 3.5 6.7-1.8 4-8.6 8.4-8.6 8.4z" />
  ),
  'heart-filled': (
    <path d="M12 20.3s-7.1-4.4-8.9-8.4C1.5 8.5 3.3 5.2 6.6 5.2c1.9 0 3.3 1 4.2 2.2 1-1.2 2.4-2.2 4.3-2.2 3.3 0 5.1 3.3 3.5 6.7-1.8 4-8.6 8.4-8.6 8.4z" />
  ),
  flame: (
    <path d="M12.2 3c.5 2.7-1.4 4-1.4 5.9 0 1 .7 1.8 1.6 1.8 1.3 0 2-1.2 1.9-2.7 1.8 1.6 2.8 3.4 2.8 5.2A5.6 5.6 0 0 1 11.5 19 5.6 5.6 0 0 1 6 13.4C6 9 9.5 6.4 12.2 3z" />
  ),
  pencil: (
    <>
      <path d="M4 20l4.2-1.1L19 8.1a2.2 2.2 0 0 0-3.1-3.1L5.1 15.8 4 20z" />
      <path d="M13.8 6.2l4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4.8h6V7M6.8 7l1 13h8.4l1-13" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="M15.4 15.4L20 20" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  copy: (
    <>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.2 4.2L19 7" />,
  'arrow-right': <path d="M4 12h15M13 6l6 6-6 6" />,
  home: (
    <>
      <path d="M3.5 10.5L12 3.5l8.5 7" />
      <path d="M5.5 9.2V20h13V9.2" />
      <path d="M9.5 20v-6h5v6" />
    </>
  ),
  book: (
    <>
      <path d="M12 6.2C9.8 4.7 7.2 4.2 4 4.2v14.3c3.2 0 5.8.5 8 2 2.2-1.5 4.8-2 8-2V4.2c-3.2 0-5.8.5-8 2z" />
      <path d="M12 6.2v14.3" />
    </>
  ),
  pot: (
    <>
      <path d="M4 10h16v6.5a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 16.5z" />
      <path d="M2 10h20M8 7V4.8M16 7V4.8" />
      <path d="M8.5 13.5h.01M15.5 13.5h.01" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5h4l1.4-2h5.2l1.4 2h4V20H4z" />
      <circle cx="12" cy="14" r="3.2" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="15" rx="2" />
      <path d="M8 3.5v4M16 3.5v4M4 10h16" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" />
    </>
  ),
  settings: (
    <>
      <path d="M4 6.5h16M4 12h16M4 17.5h16" />
      <circle cx="9" cy="6.5" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="10" cy="17.5" r="2" />
    </>
  ),
  fridge: (
    <>
      <rect x="6.5" y="3" width="11" height="18" rx="2" />
      <path d="M6.5 10h11M9.5 6.5v1.5M9.5 13v2M15 16h.01" />
    </>
  ),
  bowl: (
    <>
      <path d="M4 11h16c0 4.2-3.2 7-8 7s-8-2.8-8-7z" />
      <path d="M8 8c0-2 1.2-2.8 1.2-4M12 8c0-2 1.2-2.8 1.2-4M16 8c0-1.5.8-2.3.8-3" />
      <path d="M6 20h12" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.2 2" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 12.2L12 3.7h5.8l2.5 2.5v5.8l-8.5 8.5z" />
      <circle cx="16.4" cy="7.6" r="1.2" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.8 9.2l-2 4.8-4.8 2 2-4.8z" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20v-7M9.3 20V8M14.6 20v-5M20 20V4" />
      <path d="M2.5 20h19" />
    </>
  ),
  send: (
    <>
      <path d="M21 3L10.5 13.5" />
      <path d="M21 3l-6.8 18-3.7-7.5L3 9.8z" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
    </>
  ),
};

export function Icon({
  name,
  size = 18,
  ...rest
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  const filled = name === 'heart-filled';
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
