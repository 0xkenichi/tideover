// Calendar-day helpers. Tideover thinks in Lagos days (WAT, UTC+1, no DST),
// written as YYYY-MM-DD strings so they compare and serialise cleanly.

const DAY_MS = 86_400_000;
const WAT_OFFSET_MS = 3_600_000;

/** The Lagos calendar day of an ISO timestamp. */
export function lagosDay(iso: string): string {
  return new Date(Date.parse(iso) + WAT_OFFSET_MS).toISOString().slice(0, 10);
}

export function dayNumber(day: string): number {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
}

export function fromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  return fromDayNumber(dayNumber(day) + days);
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a);
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** The given day of a month, clamped for short months (the 31st becomes the 30th in November). */
export function dayInMonth(year: number, month0: number, dayOfMonth: number): string {
  const y = year + Math.floor(month0 / 12);
  const m = ((month0 % 12) + 12) % 12;
  const d = Math.min(dayOfMonth, daysInMonth(y, m));
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
}

function parts(day: string): { y: number; m: number } {
  return { y: Number(day.slice(0, 4)), m: Number(day.slice(5, 7)) - 1 };
}

/**
 * Which promised due date a payment belongs to. Late payments are far more
 * common than early ones, so a payment up to 20 days after a due date counts
 * as late for that date; otherwise it counts as early for the next one.
 */
export function dueDateFor(day: string, promiseDay: number): string {
  const { y, m } = parts(day);
  const thisMonth = dayInMonth(y, m, promiseDay);
  if (dayNumber(day) >= dayNumber(thisMonth)) {
    const late = daysBetween(thisMonth, day);
    const next = dayInMonth(y, m + 1, promiseDay);
    return late <= 20 || daysBetween(day, next) >= late ? thisMonth : next;
  }
  const previous = dayInMonth(y, m - 1, promiseDay);
  return daysBetween(previous, day) <= 20 ? previous : thisMonth;
}

/** The promised due date in the month after `due`. */
export function nextDueDate(due: string, promiseDay: number): string {
  const { y, m } = parts(due);
  return dayInMonth(y, m + 1, promiseDay);
}

/** Monthly occurrences of `dayOfMonth` in the range (after, until]. */
export function monthlyOccurrences(dayOfMonth: number, after: string, until: string): string[] {
  const out: string[] = [];
  let { y, m } = parts(after);
  for (let i = 0; i < 24; i++, m++) {
    const d = dayInMonth(y, m, dayOfMonth);
    if (dayNumber(d) > dayNumber(until)) break;
    if (dayNumber(d) > dayNumber(after)) out.push(d);
  }
  return out;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon 9 Nov" */
export function formatDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "9 Nov" */
export function formatShortDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "1st", "2nd", "23rd" */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
