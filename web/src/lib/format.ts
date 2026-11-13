import type { Mode } from './types';

export const MODE_LABEL: Record<Mode, string> = {
  administrative: 'Administrative',
  instructor: 'Instructor',
  researcher: 'Researcher',
  faculty_development: 'Faculty Development',
};

export const MODE_DESC: Record<Mode, string> = {
  administrative: 'Current clerical and secretariat responsibilities lead; academic preparation runs alongside.',
  instructor: 'Teaching load, syllabi and assessments lead the Nexus.',
  researcher: 'Research projects, manuscripts and presentations lead the Nexus.',
  faculty_development: 'Qualifications, training and portfolio growth lead the Nexus.',
};

/** snake_case → Title Case, with a few academic acronyms preserved. */
export function humanize(s: string | null | undefined): string {
  if (!s) return '';
  const keep: Record<string, string> = { cpd: 'CPD', doi: 'DOI', url: 'URL', clo: 'CLO', po: 'PO', ilo: 'ILO', id: 'ID', tos: 'TOS', cv: 'CV' };
  return s.split('_').map((w, i) => keep[w] || (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' → '14 Nov 2026' without timezone drift. */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return d;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${fmtTime12(d, false)}`;
}

export function relTime(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)} d ago`;
  return fmtDate(iso.slice(0, 10));
}

/** Days from today (local) to a YYYY-MM-DD date. */
export function daysUntil(d: string): number {
  const [y, m, day] = d.split('-').map(Number);
  const target = new Date(y, m - 1, day).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 864e5);
}

export function dueLabel(d: string): string {
  const n = daysUntil(d);
  if (n < 0) return `${-n}d overdue`;
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `in ${n}d`;
}

export const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const initials = (name: string | null | undefined, fallback = 'S') =>
  (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || fallback;

export const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** 12-hour clock, e.g. 9:05:07 AM */
export function fmtTime12(d: Date, seconds = true): string {
  const h = d.getHours() % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${mm}${seconds ? `:${ss}` : ''} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const fmtLongDate = (d: Date) => `${DAYS[d.getDay()].slice(0, 3)}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
export const weekdayName = (d: Date) => DAYS[d.getDay()];
export const monthName = (d: Date) => MONTHS_LONG[d.getMonth()];
