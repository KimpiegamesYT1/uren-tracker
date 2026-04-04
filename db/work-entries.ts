import { getDb, WorkEntry } from './schema';

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
     WHERE we.amount_paid < we.amount AND we.deleted_at IS NULL
     ORDER BY we.date ASC, we.start_time ASC`
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
  amount: number
): number {
  const db = getDb();
  const result = db.runSync(
    `INSERT INTO work_entries (date, company_id, start_time, end_time, note, duration_minutes, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [date, companyId, startTime, endTime, note, durationMinutes, amount]
  );
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
  amount: number
): void {
  const db = getDb();
  db.runSync(
    `UPDATE work_entries SET date = ?, company_id = ?, start_time = ?, end_time = ?, note = ?,
     duration_minutes = ?, amount = ? WHERE id = ?`,
    [date, companyId, startTime, endTime, note, durationMinutes, amount, id]
  );
}

export function updateWorkEntryPayment(id: number, amountPaid: number, isLocked: number): void {
  const db = getDb();
  db.runSync(
    'UPDATE work_entries SET amount_paid = ?, is_locked = ? WHERE id = ?',
    [amountPaid, isLocked, id]
  );
}

export function deleteWorkEntry(id: number): void {
  const db = getDb();
  db.runSync("UPDATE work_entries SET deleted_at = datetime('now') WHERE id = ?", [id]);
}

export function restoreWorkEntry(id: number): void {
  const db = getDb();
  db.runSync('UPDATE work_entries SET deleted_at = NULL WHERE id = ?', [id]);
}

export function getMonthSummaries(): { year: number; month: number; total_hours: number; total_amount: number }[] {
  const db = getDb();
  return db.getAllSync<{ year: number; month: number; total_hours: number; total_amount: number }>(
    `SELECT
       CAST(strftime('%Y', date) AS INTEGER) as year,
       CAST(strftime('%m', date) AS INTEGER) as month,
       ROUND(SUM(duration_minutes) / 60.0, 2) as total_hours,
       ROUND(SUM(amount), 2) as total_amount
     FROM work_entries
     WHERE deleted_at IS NULL
     GROUP BY year, month
     ORDER BY year DESC, month DESC`
  );
}
