// Shared calendar helpers: month grids, ISO dates in local time, and labels for holidays and events.
export interface Holiday { date: string; name: string; type: string; region: 'PH' | 'AU'; state?: string; estimated?: boolean; observed?: boolean; note?: string | null; source?: 'rule' | 'you'; override_id?: number }
export interface CalEvent { date: string; end_date?: string | null; time?: string | null; end_time?: string | null; kind: string; title: string; type: string; id: number; done?: boolean; detail?: string }
export interface CalData { from: string; to: string; holidays: Holiday[]; events: CalEvent[]; settings: { show_ph: boolean; show_au: boolean; au_state: string; week_start: number; au_states: Record<string, string> } }

export const pad = (n: number) => String(n).padStart(2, '0');
export const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => isoOf(new Date());
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 6×7 grid of ISO dates covering the month, starting on Sunday (0) or Monday (1). */
export function monthGrid(year: number, month0: number, weekStart = 0): string[] {
  const first = new Date(year, month0, 1);
  const offset = (first.getDay() - weekStart + 7) % 7;
  const start = new Date(year, month0, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => isoOf(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
}
export const weekdayHeaders = (weekStart = 0) => Array.from({ length: 7 }, (_, i) => WEEKDAYS[(i + weekStart) % 7]);

export const KIND_LABEL: Record<string, string> = {
  deadline: 'Deadline', task: 'Task', meeting: 'Meeting', class: 'Class', assessment: 'Assessment', training: 'Training',
  speaking: 'Speaking', renewal: 'Licence', goal: 'Goal', extension: 'Extension',
};
export const holidayLabel = (h: Holiday) =>
  h.region === 'PH' ? (h.type === 'regular' ? 'Regular holiday' : h.type === 'special_working' ? 'Special working day' : 'Special non-working day') : `Public holiday${h.state ? ` · ${h.state}` : ''}`;

/** Events overlapping a date (multi-day trainings included). */
export const eventsOn = (events: CalEvent[], date: string) => events.filter((e) => e.date === date || (e.end_date && e.date <= date && e.end_date >= date));
