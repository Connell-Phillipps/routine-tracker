// Calendar dates are plain 'YYYY-MM-DD' strings in local time. All arithmetic goes
// through UTC midnight so daylight-saving changes never shift a day.

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86400000;

const pad = (n) => String(n).padStart(2, '0');

export function isISODate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms) {
  const t = new Date(ms);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function toISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayISO() {
  return toISO(new Date());
}

export function addDays(iso, n) {
  return fromUTC(toUTC(iso) + n * DAY_MS);
}

/** Whole days from b to a (a - b). */
export function diffDays(a, b) {
  return Math.round((toUTC(a) - toUTC(b)) / DAY_MS);
}

/** Day of week, 0 = Monday ... 6 = Sunday. */
export function dow(iso) {
  return (new Date(toUTC(iso)).getUTCDay() + 6) % 7;
}

export function dayKey(iso) {
  return DAY_KEYS[dow(iso)];
}

export function weekStart(iso) {
  return addDays(iso, -dow(iso));
}

/** Inclusive list of dates from start to end. */
export function dateRange(start, end) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function fmtDate(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${DAY_NAMES[dow(iso)]} ${d} ${MONTHS[m - 1]}`;
}

export function fmtShort(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}
