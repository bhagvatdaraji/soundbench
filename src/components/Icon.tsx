/** Inline stroke icons (24×24). Add new ones to PATHS. */
const PATHS = {
  back: 'M15 5l-7 7 7 7',
  settings:
    'M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  sine: 'M2 12c2.5-8 5.5-8 8 0s5.5 8 8 0 3-5 4-5',
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M8 5v14M16 5v14',
  stop: 'M6 6h12v12H6z',
  reset: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  meter: 'M4 16a8 8 0 1 1 16 0M12 16l4-6M4 20h16',
  bars: 'M4 20V12M8 20V8M12 20V14M16 20V5M20 20V10',
  spectrum: 'M2 18c3 0 3-10 6-10s3 6 5 6 3-9 5-9 2 13 4 13',
  scope: 'M3 12h3l2-6 3 12 3-9 2 3h5',
  target: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  waterfall: 'M3 5h18M3 9h14M3 13h17M3 17h10M3 21h15',
  log: 'M3 3v18h18M7 14l3-3 3 2 5-6',
  impulse: 'M3 18h5l1-14 2 18 1-8 1 4h8',
  traffic: 'M9 2h6v20H9zM12 6.5h.01M12 12h.01M12 17.5h.01',
  polarity: 'M5 12h14M12 5v14M5 19h5',
  peak: 'M12 4v16M8 8l4-4 4 4',
  hold: 'M3 6h3M9 6h3M15 6h3M21 6h0M3 19c3 0 4-8 9-8s6 8 9 8',
  close: 'M6 6l12 12M18 6L6 18',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
