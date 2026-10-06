const PATHS = {
  play: 'M7 5v14l11-7z',
  pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
  next: 'M6 5v14l9-7zM16 5h2v14h-2z',
  previous: 'M18 5v14l-9-7zM6 5h2v14H6z',
  reset: 'M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z',
  chevronDown: 'M7 10l5 5 5-5z',
  chevronUp: 'M7 14l5-5 5 5z',
  keyboard: 'M3 6h18v12H3zM6 9h2v2H6zm4 0h2v2h-2zm4 0h2v2h-2zM7 13h10v2H7z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d={PATHS[name]} />
    </svg>
  );
}
