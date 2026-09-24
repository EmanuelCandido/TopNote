type IconProps = { size?: number }

export function KeyboardShortcutIcon({ size = 34 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="10" width="34" height="21" rx="4"/>
    <path d="M8 16h3m5 0h3m5 0h3m5 0h1M8 21h3m5 0h3m5 0h3m5 0h1M8 26h3m5 0h16"/>
  </svg>
}

export function OrganizedNotesIcon({ size = 34 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 13V9a3 3 0 0 1 3-3h8l3 4h16a3 3 0 0 1 3 3v3"/>
    <path d="M10 15h15l4 4v12H10z"/>
    <path d="M25 15v5h4M14 24h11M14 28h8"/>
    <path d="M3 17v14a3 3 0 0 0 3 3h27a3 3 0 0 0 3-3V17"/>
  </svg>
}
