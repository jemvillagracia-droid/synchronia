// Primary navigation: grouped like the SOUL ARCHIVE sidebar, numbered, and linking only to modules that exist.
// Items that open a tab of a module (e.g. /admin?tab=meetings) are active only on that tab; the module's own item is
// active on its other tabs.
export interface NavItem { id: string; label: string; to: string; icon: string; action?: 'capture' }
export interface NavGroup { label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  { label: 'Command Center', items: [
    { id: 'nexus', label: 'Central Nexus', to: '/', icon: 'nexus' },
    { id: 'calendar', label: 'Academic Calendar', to: '/calendar', icon: 'calendar' },
    { id: 'timer', label: 'System Timer', to: '/timer', icon: 'clock' },
    { id: 'capture', label: 'Quick Capture', to: '', icon: 'bolt', action: 'capture' },
    { id: 'moodboard', label: 'Idea Moodboard', to: '/moodboard', icon: 'panel' },
  ] },
  { label: 'Academic Operations', items: [
    { id: 'academic', label: 'Academic Workspace', to: '/academic', icon: 'academic' },
    { id: 'research', label: 'Research Development', to: '/research', icon: 'research' },
    { id: 'extension', label: 'Extension and Engagement', to: '/academic?tab=extension', icon: 'people' },
  ] },
  { label: 'Professional Development', items: [
    { id: 'portfolio', label: 'Professional Portfolio', to: '/portfolio', icon: 'portfolio' },
    { id: 'cv', label: 'Curriculum Vitae Studio', to: '/cv', icon: 'cv' },
    { id: 'development', label: 'Faculty Development', to: '/academic?tab=development', icon: 'growth' },
    { id: 'timeline', label: 'Professional Timeline', to: '/portfolio/timeline', icon: 'timeline' },
  ] },
  { label: 'Intelligence', items: [
    { id: 'intelligence', label: 'Reports and Analytics', to: '/intelligence', icon: 'intelligence' },
  ] },
  { label: 'Administrative Operations', items: [
    { id: 'admin', label: 'Administrative Overview', to: '/admin', icon: 'admin' },
    { id: 'correspondence', label: 'Correspondence', to: '/admin?tab=correspondence', icon: 'mail' },
    { id: 'meetings', label: 'Meetings', to: '/admin?tab=meetings', icon: 'people' },
    { id: 'secretariat', label: 'Secretariat', to: '/admin?tab=secretariat', icon: 'clipboard' },
    { id: 'log', label: 'Office Activities', to: '/admin?tab=log', icon: 'list' },
  ] },
  { label: 'Knowledge Management', items: [
    { id: 'knowledge', label: 'Knowledge and References', to: '/knowledge', icon: 'knowledge' },
    { id: 'literature', label: 'Literature Review', to: '/research?tab=literature', icon: 'book' },
  ] },
  { label: 'System', items: [
    { id: 'settings', label: 'Settings', to: '/settings', icon: 'settings' },
    { id: 'backup', label: 'Backup and Recovery', to: '/settings?tab=data', icon: 'database' },
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
