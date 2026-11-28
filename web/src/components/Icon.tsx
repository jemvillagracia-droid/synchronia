// Minimal geometric icon set (24px grid, 1.5 stroke).
const P: Record<string, JSX.Element> = {
  nexus: <><path d="M12 2.5 21 7.5v9L12 21.5 3 16.5v-9z" /><circle cx="12" cy="12" r="3" /><path d="M12 2.5V9M12 15v6.5M3 7.5l6.4 3M14.6 13.5 21 16.5" /></>,
  academic: <><path d="M2.5 8.5 12 4l9.5 4.5L12 13z" /><path d="M6 10.4v5.1c0 1.4 2.7 3 6 3s6-1.6 6-3v-5.1M21.5 8.5v6" /></>,
  portfolio: <><rect x="3" y="7" width="18" height="13" /><path d="M9 7V4h6v3M3 12.5h18M10.5 12.5v2h3v-2" /></>,
  cv: <><path d="M6 2.5h8.5L19 7v14.5H6z" /><path d="M14.5 2.5V7H19M9 11h7M9 14.5h7M9 18h4" /></>,
  intelligence: <><path d="M3.5 20.5h17" /><path d="M6 17v-5M10.5 17V7M15 17v-7M19.5 17V4" /></>,
  admin: <><path d="M3 13.5 5.5 4h13l2.5 9.5v6.5H3z" /><path d="M3 13.5h5.5l1.2 2.5h4.6l1.2-2.5H21" /></>,
  knowledge: <><path d="M4 4.5h5.5a2.5 2.5 0 0 1 2.5 2.5v13a2 2 0 0 0-2-2H4z" /><path d="M20 4.5h-5.5A2.5 2.5 0 0 0 12 7v13a2 2 0 0 1 2-2h6z" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" /></>,
  research: <><path d="M9 2.5h6M10 2.5v6.2L4.6 18.2A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.7-2.8L14 8.7V2.5" /><path d="M7.2 14.5h9.6" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20c.5-3.3 2.6-5.5 5.5-5.5s5 2.2 5.5 5.5" /><path d="M15.5 5.2a3 3 0 0 1 0 5.6M17.5 14.8c1.7.7 2.8 2.5 3 5.2" /></>,
  growth: <><path d="M3.5 20.5h17" /><path d="m4.5 16 5-5 3.5 3.5 6.5-7" /><path d="M15 7.5h4.5V12" /></>,
  timeline: <><path d="M5 3.5v17" /><circle cx="5" cy="7" r="1.6" /><circle cx="5" cy="13" r="1.6" /><circle cx="5" cy="19" r="1.6" /><path d="M9 7h11M9 13h8M9 19h10" /></>,
  mail: <><rect x="3" y="5.5" width="18" height="13" /><path d="m3 6.5 9 6.5 9-6.5" /></>,
  clipboard: <><rect x="5" y="4.5" width="14" height="16.5" /><path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 13.5h7M8.5 17h4" /></>,
  list: <><path d="M9 6h11.5M9 12h11.5M9 18h11.5" /><path d="M3.5 6h1.5M3.5 12h1.5M3.5 18h1.5" /></>,
  book: <><path d="M5 3.5h11.5a2 2 0 0 1 2 2V21H7a2 2 0 0 1-2-2z" /><path d="M5 17.5a2 2 0 0 1 2-2h11.5M9 7.5h6" /></>,
  database: <><ellipse cx="12" cy="5.5" rx="7.5" ry="3" /><path d="M4.5 5.5v13c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-13M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>,
  plus: <path d="M12 4.5v15M4.5 12h15" />,
  bell: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" /><path d="M10 20.5h4" /></>,
  menu: <path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" />,
  collapse: <><rect x="3" y="4" width="18" height="16" /><path d="M9 4v16M15.5 9.5 13 12l2.5 2.5" /></>,
  expand: <><rect x="3" y="4" width="18" height="16" /><path d="M9 4v16M13 9.5l2.5 2.5-2.5 2.5" /></>,
  panel: <><rect x="3" y="4" width="18" height="16" /><path d="M15 4v16" /></>,
  close: <path d="m5.5 5.5 13 13M18.5 5.5l-13 13" />,
  check: <path d="m4.5 12.5 5 5 10-11" />,
  up: <path d="m6 14.5 6-6 6 6" />,
  down: <path d="m6 9.5 6 6 6-6" />,
  right: <path d="m9.5 6 6 6-6 6" />,
  left: <path d="m14.5 6-6 6 6 6" />,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>,
  'eye-off': <><path d="M3 3l18 18M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.6 3.3M6.6 7.2C4 9 2.5 12 2.5 12s3.5 6 9.5 6a9 9 0 0 0 4.3-1.1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  logout: <><path d="M14 4.5H19.5v15H14" /><path d="M10 8 6 12l4 4M6 12h10" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 20.5c1.4-3.8 4.4-5.5 8-5.5s6.6 1.7 8 5.5" /></>,
  grip: <><circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" /></>,
  edit: <><path d="M4 20h4L19.5 8.5l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  trash: <><path d="M4 6.5h16M9.5 6.5V4h5v2.5M6 6.5l1 14h10l1-14" /></>,
  restore: <><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" /><path d="M4 4v4.5h4.5" /></>,
  download: <><path d="M12 3.5v12M7 11l5 5 5-5M4 20.5h16" /></>,
  upload: <><path d="M12 16.5v-12M7 9l5-5 5 5M4 20.5h16" /></>,
  file: <><path d="M6 2.5h8l4 4v15H6zM14 2.5v4h4M9 12h6M9 16h6" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" /><path d="M3.5 9.5h17M8 3v4M16 3v4M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  alert: <><path d="M12 3.5 22 20.5H2z" /><path d="M12 10v4.5M12 17.2v.3" /></>,
  sliders: <><path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1" /><path d="M15 4.5v4M9 10v4M17 15.5v4" /></>,
  history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3.5 4.5V9H8M12 7.5V12l3 2" /></>,
  play: <path d="M7.5 4.5v15l12-7.5z" />,
  bolt: <path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z" />,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3.5-3.5a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3.5 3.5a4 4 0 0 0 5.7 5.7l1-1" /></>,
};

export type IconName = keyof typeof P;

export function Icon({ name, size, title }: { name: string; size?: number; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter"
      width={size} height={size} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {P[name] || P.nexus}
    </svg>
  );
}

/** The SYNCHRONIA mark: a triangle (ascent) around a synchronised core. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 3 L29 27 H3 Z" fill="none" stroke="var(--orange)" strokeWidth="2" />
      <path d="M16 10.5 L23.2 23.5 H8.8 Z" fill="none" stroke="var(--line-3)" strokeWidth="1" />
      <circle cx="16" cy="19.2" r="3.2" fill="var(--violet)" />
    </svg>
  );
}
