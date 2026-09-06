/**
 * Presentation helpers for times and dates.
 *
 * Pure calculation logic (duration, money) lives in ./calculations so it can be
 * unit-tested without pulling in any React Native or database code.
 */

/**
 * Returns a human-readable string for a duration in minutes (e.g. "7u 30m").
 */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}u`;
  return `${h}u ${m}m`;
}

/**
 * Formats a Date object to a "HH:MM" string.
 */
export function dateToTimeString(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Formats a Date object to a "YYYY-MM-DD" string.
 */
export function dateToDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parses a "YYYY-MM-DD" string into a Date at midnight local time.
 */
export function dateStringToDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}
