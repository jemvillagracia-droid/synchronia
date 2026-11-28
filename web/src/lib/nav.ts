// Primary navigation: grouped like the SOUL ARCHIVE sidebar, numbered, and linking only to modules that exist.
// Items that open a tab of a module (e.g. /settings?tab=data) are active only on that tab; the module's own item is
// active on its other tabs.
export interface NavItem { id: string; label: string; to: string; icon: string; action?: 'capture' }
export interface NavGroup { label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  // Main compartments only: anything that is a tab inside one of these (Literature Review, Extension, Faculty
  // Development, Professional Timeline, Backup and Recovery) is reached from its compartment, not listed twice.
  { label: 'Command Center', items: [
    { id: 'nexus', label: 'Central Nexus', to: '/', icon: 'nexus' },
    { id: 'calendar', label: 'Academic Calendar', to: '/calendar', icon: 'calendar' },
    { id: 'timer', label: 'System Timer', to: '/timer', icon: 'clock' },
    { id: 'moodboard', label: 'Idea Moodboard', to: '/moodboard', icon: 'panel' },
  ] },
  { label: 'Teaching and Research', items: [
    { id: 'academic', label: 'Academic Workspace', to: '/academic', icon: 'academic' },
    { id: 'research', label: 'Research Development', to: '/research', icon: 'research' },
  ] },
  { label: 'Professional Development', items: [
    { id: 'portfolio', label: 'Professional Portfolio', to: '/portfolio', icon: 'portfolio' },
    { id: 'credentials', label: 'Credentials Tracker', to: '/credentials', icon: 'clipboard' },
    { id: 'cv', label: 'Curriculum Vitae Studio', to: '/cv', icon: 'cv' },
  ] },
  { label: 'Intelligence', items: [
    { id: 'intelligence', label: 'Reports and Analytics', to: '/intelligence', icon: 'intelligence' },
    { id: 'knowledge', label: 'Knowledge and References', to: '/knowledge', icon: 'knowledge' },
  ] },
  { label: 'System', items: [
    { id: 'settings', label: 'Settings', to: '/settings', icon: 'settings' },
  ] },
];

const ALL = NAV.flatMap((g) => g.items).filter((i) => !i.action);
const split = (to: string) => { const [path, q = ''] = to.split('?'); return { path, tab: new URLSearchParams(q).get('tab') }; };

/** Whether a navigation item is the active one for this location. */
export function isActive(item: NavItem, pathname: string, search: string): boolean {
  if (item.action) return false;
  const { path, tab } = split(item.to);
  const here = new URLSearchParams(search).get('tab');
  const onPath = path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);
  if (!onPath) return false;
  // A more specific item (a deeper path) owns its own pages, e.g. /portfolio/timeline over /portfolio.
  if (ALL.some((o) => o !== item && split(o.to).path !== path && split(o.to).path.startsWith(`${path}/`) && (pathname === split(o.to).path || pathname.startsWith(`${split(o.to).path}/`)))) return false;
  if (tab) return here === tab;
  const claimed = ALL.filter((o) => split(o.to).path === path && split(o.to).tab).map((o) => split(o.to).tab);
  return !here || !claimed.includes(here);
}

/** Two-digit codes, numbered in order like the SOUL ARCHIVE sidebar. */
export const navCode = (() => { const m: Record<string, string> = {}; let n = 0; for (const g of NAV) for (const i of g.items) m[i.id] = String(n++).padStart(2, '0'); return m; })();
