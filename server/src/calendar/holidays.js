// Public holidays for the Philippines and Australia, computed from the rules in law for any year.
// Dates fixed by annual proclamation (Islamic holidays in the Philippines, Western Australia's King's Birthday, and any
// one-off declarations) are marked `estimated`; the owner can correct or add dates, and those corrections win.

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const dow = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sunday … 6 Saturday
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Western (Gregorian) Easter Sunday — anonymous Gregorian algorithm. */
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(y, month, day);
}
/** nth weekday (0=Sun) of a month; n = -1 for the last. */
export function nthWeekday(y, m, weekday, n) {
  if (n > 0) { const first = dow(y, m, 1); return iso(y, m, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7); }
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return iso(y, m, last - ((dow(y, m, last) - weekday + 7) % 7));
}

// Lunar dates. Chinese New Year is astronomical (reliable); the two Eids are proclaimed yearly in the Philippines and
// can move by a day, so they are shown as estimates until the owner confirms them.
const CHINESE_NEW_YEAR = { 2024: '2024-02-10', 2025: '2025-01-29', 2026: '2026-02-17', 2027: '2027-02-06', 2028: '2028-01-26', 2029: '2029-02-13', 2030: '2030-02-03', 2031: '2031-01-23', 2032: '2032-02-11' };
const EID_AL_FITR = { 2024: '2024-04-10', 2025: '2025-04-01', 2026: '2026-03-20', 2027: '2027-03-10', 2028: '2028-02-27', 2029: '2029-02-15', 2030: '2030-02-05' };
const EID_AL_ADHA = { 2024: '2024-06-17', 2025: '2025-06-06', 2026: '2026-05-27', 2027: '2027-05-16', 2028: '2028-05-05', 2029: '2029-04-24', 2030: '2030-04-13' };

/** Philippines: regular holidays and special (non-working) days under RA 9492 as amended. */
export function philippineHolidays(y) {
  const e = easter(y);
  const H = (date, name, type, extra = {}) => ({ date, name, type, region: 'PH', ...extra });
  const out = [
    H(iso(y, 1, 1), "New Year's Day", 'regular'),
    H(addDays(e, -3), 'Maundy Thursday', 'regular'),
    H(addDays(e, -2), 'Good Friday', 'regular'),
    H(addDays(e, -1), 'Black Saturday', 'special'),
    H(iso(y, 4, 9), 'Araw ng Kagitingan (Day of Valor)', 'regular'),
    H(iso(y, 5, 1), 'Labor Day', 'regular'),
    H(iso(y, 6, 12), 'Independence Day', 'regular'),
    H(iso(y, 8, 21), 'Ninoy Aquino Day', 'special'),
    H(nthWeekday(y, 8, 1, -1), 'National Heroes Day', 'regular'),
    H(iso(y, 11, 1), "All Saints' Day", 'special'),
    H(iso(y, 11, 2), "All Souls' Day", 'special', { note: 'Declared a special non-working day in recent years; confirm each year.', estimated: true }),
    H(iso(y, 11, 30), 'Bonifacio Day', 'regular'),
    H(iso(y, 12, 8), 'Feast of the Immaculate Conception of Mary', 'special'),
    H(iso(y, 12, 24), 'Christmas Eve', 'special'),
    H(iso(y, 12, 25), 'Christmas Day', 'regular'),
    H(iso(y, 12, 30), 'Rizal Day', 'regular'),
    H(iso(y, 12, 31), 'Last Day of the Year', 'special'),
  ];
  if (CHINESE_NEW_YEAR[y]) out.push(H(CHINESE_NEW_YEAR[y], 'Chinese New Year', 'special'));
  out.push(EID_AL_FITR[y] ? H(EID_AL_FITR[y], "Eid'l Fitr (Feast of Ramadan)", 'regular', { estimated: true, note: 'Date set each year by proclamation; shown as an estimate until confirmed.' })
    : H(null, "Eid'l Fitr", 'regular', { estimated: true }));
  out.push(EID_AL_ADHA[y] ? H(EID_AL_ADHA[y], "Eid'l Adha (Feast of Sacrifice)", 'regular', { estimated: true, note: 'Date set each year by proclamation; shown as an estimate until confirmed.' })
    : H(null, "Eid'l Adha", 'regular', { estimated: true }));
  return out.filter((h) => h.date);
}

export const AU_STATES = { ACT: 'Australian Capital Territory', NSW: 'New South Wales', NT: 'Northern Territory', QLD: 'Queensland', SA: 'South Australia', TAS: 'Tasmania', VIC: 'Victoria', WA: 'Western Australia' };

/** A holiday falling on a weekend is observed on the following Monday (the usual Australian rule). */
function mondayIfWeekend(date) { const d = new Date(`${date}T00:00:00Z`).getUTCDay(); return d === 6 ? addDays(date, 2) : d === 0 ? addDays(date, 1) : null; }

/** Australia: national public holidays plus those of the chosen state or territory. */
export function australianHolidays(y, state = 'VIC') {
  if (!AU_STATES[state]) throw new Error(`Unknown state ${state}`);
  const e = easter(y);
  const out = [];
  const H = (date, name, extra = {}) => out.push({ date, name, type: 'public', region: 'AU', state, ...extra });
  const withSubstitute = (date, name, states = Object.keys(AU_STATES)) => {
    H(date, name);
    const sub = mondayIfWeekend(date);
    if (sub && states.includes(state)) H(sub, `${name} (observed)`, { observed: true });
  };
  withSubstitute(iso(y, 1, 1), "New Year's Day");
  withSubstitute(iso(y, 1, 26), 'Australia Day');
  H(addDays(e, -2), 'Good Friday');
  if (state !== 'TAS' && state !== 'WA') H(addDays(e, -1), 'Easter Saturday');
  if (['NSW', 'VIC', 'QLD', 'ACT', 'WA', 'SA'].includes(state)) H(e, 'Easter Sunday');
  H(addDays(e, 1), 'Easter Monday');
  H(iso(y, 4, 25), 'Anzac Day');
  { const sub = mondayIfWeekend(iso(y, 4, 25)); if (sub && ['WA', 'ACT'].includes(state) && dow(y, 4, 25) === 0) H(sub, 'Anzac Day (observed)', { observed: true }); }
  // King's Birthday
  if (state === 'QLD') H(nthWeekday(y, 10, 1, 1), "King's Birthday");
  else if (state === 'WA') H(nthWeekday(y, 9, 1, -1), "King's Birthday", { estimated: true, note: 'Western Australia sets this date by proclamation (usually the last Monday of September).' });
  else H(nthWeekday(y, 6, 1, 2), "King's Birthday");
  // Labour Day and its equivalents
  if (state === 'VIC') H(nthWeekday(y, 3, 1, 2), 'Labour Day');
  if (state === 'TAS') H(nthWeekday(y, 3, 1, 2), 'Eight Hours Day');
  if (state === 'WA') H(nthWeekday(y, 3, 1, 1), 'Labour Day');
  if (state === 'QLD') H(nthWeekday(y, 5, 1, 1), 'Labour Day');
  if (state === 'NT') H(nthWeekday(y, 5, 1, 1), 'May Day');
  if (['NSW', 'ACT', 'SA'].includes(state)) H(nthWeekday(y, 10, 1, 1), 'Labour Day');
  // State and territory days
  if (state === 'VIC') H(nthWeekday(y, 11, 2, 1), 'Melbourne Cup Day', { note: 'Metropolitan Melbourne; some regional areas substitute another day.' });
  if (state === 'ACT') { H(nthWeekday(y, 3, 1, 2), 'Canberra Day'); const r = iso(y, 5, 27); H(dow(y, 5, 27) === 1 ? r : addDays(r, (8 - dow(y, 5, 27)) % 7), 'Reconciliation Day'); }
  if (state === 'SA') H(nthWeekday(y, 3, 1, 2), 'Adelaide Cup Day');
  if (state === 'WA') H(nthWeekday(y, 6, 1, 1), 'Western Australia Day');
  if (state === 'NT') H(nthWeekday(y, 8, 1, 1), 'Picnic Day');
  // Christmas and Boxing Day (Proclamation Day in South Australia), with the substitute-day rules
  const xmas = iso(y, 12, 25), box = iso(y, 12, 26);
  const boxName = state === 'SA' ? 'Proclamation Day' : 'Boxing Day';
  H(xmas, 'Christmas Day'); H(box, boxName);
  const xd = dow(y, 12, 25);
  if (xd === 6) { H(iso(y, 12, 27), 'Christmas Day (observed)', { observed: true }); H(iso(y, 12, 28), `${boxName} (observed)`, { observed: true }); }
  else if (xd === 0) H(iso(y, 12, 27), 'Christmas Day (observed)', { observed: true });
  else if (xd === 5) H(iso(y, 12, 28), `${boxName} (observed)`, { observed: true });
  return out;
}
