// The CV contact line, broken into lines *between* items: an address or link is never split, and no separator is
// left hanging at a line end. Shared by the Word and PDF renderers so both break in the same places.
/** Lines of contact items that fit the text width at the given size (a conservative average character width). */
export function contactLines(items, { widthIn, sizePt, sep = '  |  ' }) {
  const budget = Math.max(20, Math.floor((widthIn * 72) / (sizePt * 0.95 * 0.53)));
  const lines = [];
  let cur = [];
  for (const it of items.filter(Boolean)) {
    const len = [...cur, it].join(sep).length;
    if (cur.length && len > budget) { lines.push(cur); cur = [it]; } else cur.push(it);
  }
  if (cur.length) lines.push(cur);
  return lines;
}

/** Left-hand date column: only the dates themselves; anything after " · " (e.g. "Valid until …") goes below the title. */
export function splitColumnDate(dates) {
  const s = String(dates || '');
  const i = s.indexOf(' · ');
  return i < 0 ? { date: s, extra: '' } : { date: s.slice(0, i), extra: s.slice(i + 3) };
}
