import { getDb, WorkEntry } from './schema';
import { recalculateAllPayments } from './payments';
import { MONEY_EPSILON, roundMoney } from '../utils/calculations';

export function getWorkEntriesByDate(date: string): WorkEntry[] {
  const db = getDb();
  return db.getAllSync<WorkEntry>(
    `SELECT we.*, c.name as company_name, c.color as company_color
     FROM work_entries we
     LEFT JOIN companies c ON we.company_id = c.id
     WHERE we.date = ? AND we.deleted_at IS NULL
     ORDER BY we.start_time ASC`,
    [date]
  );
}

export function getWorkEntriesByMonth(year: number, month: number): WorkEntry[] {
  const db = getDb();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return db.getAllSync<WorkEntry>(
    `SELECT we.*, c.name as company_name, c.color as company_color
     FROM work_entries we
     LEFT JOIN companies c ON we.company_id = c.id
     WHERE we.date LIKE ? AND we.deleted_at IS NULL
     ORDER BY we.date DESC, we.created_at DESC`,
    [`${prefix}%`]
  );
}

export function getAllUnpaidWorkEntries(): WorkEntry[] {
  const db = getDb();
  return db.getAllSync<WorkEntry>(
    `SELECT we.*, c.name as company_name, c.color as company_color
     FROM work_entries we
     LEFT JOIN companies c ON we.company_id = c.id
     WHERE we.amount - we.amount_paid > ? AND we.deleted_at IS NULL
     ORDER BY we.date ASC, we.start_time ASC`,
    [MONEY_EPSILON]
  );
}

export function getRecentWorkEntries(limit: number): WorkEntry[] {
  const db = getDb();
  return db.getAllSync<WorkEntry>(
    `SELECT we.*, c.name as company_name, c.color as company_color
     FROM work_entries we
     LEFT JOIN companies c ON we.company_id = c.id
     WHERE we.deleted_at IS NULL
     ORDER BY we.date DESC, we.start_time DESC
     LIMIT ?`,
    [limit]
  );
}

export function insertWorkEntry(
  date: string,
  companyId: number,
  startTime: string,
  endTime: string,
  note: string,
  durationMinutes: number,
  hourlyRate: number,
  amount: number
): number {
  const db = getDb();
  const result = db.runSync(
    `INSERT INTO work_entries (date, company_id, start_time, end_time, note, duration_minutes, hourly_rate, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [date, companyId, startTime, endTime, note, durationMinutes, roundMoney(hourlyRate), roundMoney(amount)]
  );
  recalculateAllPayments();
  return result.lastInsertRowId;
}

export function updateWorkEntry(
  id: number,
  date: string,
  companyId: number,
  startTime: string,
  endTime: string,
  note: string,
  durationMinutes: number,
  hourlyRate: number,
  amount: number
): void {
  const db = getDb();
  db.runSync(
    `UPDATE work_entries SET date = ?, company_id = ?, start_time = ?, end_time = ?, note = ?,
     duration_minutes = ?, hourly_rate = ?, amount = ? WHERE id = ?`,
    [date, companyId, startTime, endTime, note, durationMinutes, roundMoney(hourlyRate), roundMoney(amount), id]
  );
  recalculateAllPayments();
}

export function deleteWorkEntry(id: number): void {
  const db = getDb();
  db.runSync("UPDATE work_entries SET deleted_at = datetime('now') WHERE id = ?", [id]);
  recalculateAllPayments();
}

export function restoreWorkEntry(id: number): void {
  const db = getDb();
  db.runSync('UPDATE work_entries SET deleted_at = NULL WHERE id = ?', [id]);
  recalculateAllPayments();
}

export function getMonthSummaries(): {
  year: number;
  month: number;
  total_minutes: number;
  total_amount: number;
}[] {
  const db = getDb();
  return db.getAllSync<{ year: number; month: number; total_minutes: number; total_amount: number }>(
    `SELECT
       CAST(strftime('%Y', date) AS INTEGER) as year,
       CAST(strftime('%m', date) AS INTEGER) as month,
       COALESCE(SUM(duration_minutes), 0) as total_minutes,
       ROUND(COALESCE(SUM(amount), 0), 2) as total_amount
     FROM work_entries
     WHERE deleted_at IS NULL
     GROUP BY year, month
     ORDER BY year DESC, month DESC`
  );
}
