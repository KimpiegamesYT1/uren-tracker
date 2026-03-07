export type RoundingUnit = 1 | 15 | 30; // minutes
export type RoundingDirection = 'up' | 'down' | 'round';

/**
 * Rounds a number of minutes to the nearest unit in the specified direction.
 * @param minutes - Raw duration in minutes
 * @param unit - 1 (exact), 15 (quarter hour), 30 (half hour)
 * @param direction - 'up', 'down', or 'round' (mathematical rounding)
 */
export function roundMinutes(
  minutes: number,
  unit: RoundingUnit,
  direction: RoundingDirection
): number {
  if (unit === 1) return Math.round(minutes);

  if (direction === 'up') {
    return Math.ceil(minutes / unit) * unit;
  } else if (direction === 'down') {
    return Math.floor(minutes / unit) * unit;
  } else {
    return Math.round(minutes / unit) * unit;
  }
}

/**
 * Returns a human-readable string for duration in minutes (e.g. "7u 30m")
 */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}u`;
  return `${h}u ${m}m`;
}

/**
 * Parses a "HH:MM" time string and returns the total minutes since midnight.
 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Calculates raw duration in minutes between two HH:MM strings.
 * Handles midnight crossing (end < start).
 */
export function calcRawDuration(startTime: string, endTime: string): number {
  const start = timeToMinutes(startTime);
  let end = timeToMinutes(endTime);
  if (end < start) end += 24 * 60; // midnight crossing
  return end - start;
}

/**
 * Formats a Date object to HH:MM string.
 */
export function dateToTimeString(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Formats a Date object to YYYY-MM-DD string.
 */
export function dateToDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parses a YYYY-MM-DD string into a Date at midnight local time.
 */
export function dateStringToDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}
