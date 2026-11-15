// Colour themes (Settings › Appearance). The violet scheme is the default.
export interface Theme { key: string; label: string; note: string; swatch: [string, string, string] }
export const THEMES: Theme[] = [
  { key: 'violet', label: 'Violet (default)', note: 'The SYNCHRONIA scheme', swatch: ['#080808', '#8a3ffc', '#b98aff'] },
  { key: 'violet-green', label: 'Violet and neon green', note: 'Dark · neon accents', swatch: ['#0a0812', '#6d2fd6', '#a6ff5c'] },
  { key: 'crimson-orange', label: 'Crimson and orange', note: 'Dark · neon accents', swatch: ['#0d0606', '#c4161c', '#ff9a4d'] },
  { key: 'orange-white', label: 'Orange and white', note: 'Dark · neon accents', swatch: ['#0d0805', '#c2410c', '#ffd2b0'] },
  { key: 'blue-white', label: 'Blue and white', note: 'Dark · neon accents', swatch: ['#070b12', '#2563c9', '#a9d4ff'] },
  { key: 'black-silver', label: 'Black and silver', note: 'Dark · neon accents', swatch: ['#040404', '#4b5563', '#d4d8de'] },
  { key: 'pink-green', label: 'Pink and green', note: 'Dark · neon accents', swatch: ['#0e0609', '#c2337a', '#6fe06f'] },
  { key: 'steel-grey', label: 'Steel grey', note: 'Dark · neon accents', swatch: ['#07090c', '#4f6d8a', '#c7d6e6'] },
  { key: 'light', label: 'Light', note: 'Light surfaces, violet accent', swatch: ['#ffffff', '#6d28d9', '#efedf6'] },
  { key: 'sepia', label: 'Sepia', note: 'Warm paper tones for long reading', swatch: ['#fbf6ea', '#6b3fa0', '#efe5cf'] },
];
const KEY = 'synchronia-theme';
/** Apply a theme to the page (and remember it locally so the next start shows it before the data service answers). */
export function applyTheme(theme: string | undefined) {
  const t = THEMES.some((x) => x.key === theme) ? theme! : 'violet';
  if (t === 'violet') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  try { localStorage.setItem(KEY, t); } catch { /* storage unavailable: the saved preference still applies */ }
}
export function applyRememberedTheme() { try { applyTheme(localStorage.getItem(KEY) || 'violet'); } catch { /* ignore */ } }
