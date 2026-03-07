import { getRecentWorkEntries } from '../db/work-entries';

/**
 * Suggests a company based on the day-of-week pattern from recent entries.
 * Looks at the last 60 work entries and counts per company_id for the given weekday.
 * Returns the company_id with the highest count, or null if no clear pattern exists.
 */
export function suggestCompanyForDate(date: Date): number | null {
  const weekday = date.getDay(); // 0 = Sunday, 6 = Saturday
  const recentEntries = getRecentWorkEntries(60);

  const counts: Record<number, number> = {};

  for (const entry of recentEntries) {
    const [y, m, d] = entry.date.split('-').map(Number);
    const entryDate = new Date(y, m - 1, d);
    if (entryDate.getDay() === weekday) {
      counts[entry.company_id] = (counts[entry.company_id] ?? 0) + 1;
    }
  }

  if (Object.keys(counts).length === 0) return null;

  let bestCompanyId: number | null = null;
  let bestCount = 0;

  for (const [companyId, count] of Object.entries(counts)) {
    if (count > bestCount) {
      bestCount = count;
      bestCompanyId = Number(companyId);
    }
  }

  // Only suggest if there's at least 2 occurrences (meaningful pattern)
  return bestCount >= 2 ? bestCompanyId : null;
}
