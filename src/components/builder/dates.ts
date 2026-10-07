const DAY = 86400;

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isoPlusDays(days: number, from = new Date()): string {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Local end-of-day (23:59:59) for a YYYY-MM-DD date input, as unix seconds. */
export function endOfDayUnix(date: string): number {
  const t = new Date(`${date}T23:59:59`).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : NaN;
}

/** Earliest selectable deadline date: the calendar day of now + 1 day. */
export function minDeadlineISO(nowSec = Math.floor(Date.now() / 1000)): string {
  return toISODate(new Date((nowSec + DAY) * 1000));
}

/** Latest selectable deadline date: the calendar day of now + 90 days. */
export function maxDeadlineISO(nowSec = Math.floor(Date.now() / 1000)): string {
  return toISODate(new Date((nowSec + 90 * DAY) * 1000));
}

/**
 * Contract window: deadline must be ≥ block.timestamp + 1 day and ≤ +90 days.
 * The picked date's end-of-day is clamped into that window; the lower clamp keeps
 * a 15 minute buffer so a wallet confirmation delay cannot invalidate it.
 */
export function resolveDeadline(date: string, nowSec = Math.floor(Date.now() / 1000)): number {
  const end = endOfDayUnix(date);
  const min = nowSec + DAY + 900;
  const max = nowSec + 90 * DAY;
  if (!Number.isFinite(end)) return min;
  return Math.min(max, Math.max(min, end));
}

/** Contract window: deliveryDeadline > deadline and ≤ deadline + 365 days. */
export function resolveDelivery(date: string, deadline: number): number {
  const end = endOfDayUnix(date);
  const min = deadline + DAY;
  const max = deadline + 365 * DAY;
  if (!Number.isFinite(end)) return min;
  return Math.min(max, Math.max(end, min));
}

export function formatDay(timestampSec: number): string {
  return new Date(timestampSec * 1000).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
}
