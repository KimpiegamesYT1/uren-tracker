import { getDb, Expense } from './schema';

export function getExpensesByDate(date: string): Expense[] {
  const db = getDb();
  return db.getAllSync<Expense>(
    `SELECT e.*, c.name as company_name, c.color as company_color
     FROM expenses e
     LEFT JOIN companies c ON e.company_id = c.id
     WHERE e.date = ?
     ORDER BY e.created_at ASC`,
    [date]
  );
}

export function getExpensesByMonth(year: number, month: number): Expense[] {
  const db = getDb();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return db.getAllSync<Expense>(
    `SELECT e.*, c.name as company_name, c.color as company_color
     FROM expenses e
     LEFT JOIN companies c ON e.company_id = c.id
     WHERE e.date LIKE ?
     ORDER BY e.date ASC, e.created_at ASC`,
    [`${prefix}%`]
  );
}

export function getAllUnpaidExpenses(): Expense[] {
  const db = getDb();
  return db.getAllSync<Expense>(
    `SELECT e.*, c.name as company_name, c.color as company_color
     FROM expenses e
     LEFT JOIN companies c ON e.company_id = c.id
     WHERE e.amount_paid < e.amount
     ORDER BY e.date ASC, e.created_at ASC`
  );
}

export function insertExpense(
  date: string,
  companyId: number | null,
  description: string,
  amount: number,
  receiptPhotoUri: string | null
): number {
  const db = getDb();
  const result = db.runSync(
    'INSERT INTO expenses (date, company_id, description, amount, receipt_photo_uri) VALUES (?, ?, ?, ?, ?)',
    [date, companyId ?? null, description, amount, receiptPhotoUri ?? null]
  );
  return result.lastInsertRowId;
}

export function updateExpense(
  id: number,
  date: string,
  companyId: number | null,
  description: string,
  amount: number,
  receiptPhotoUri: string | null
): void {
  const db = getDb();
  db.runSync(
    'UPDATE expenses SET date = ?, company_id = ?, description = ?, amount = ?, receipt_photo_uri = ? WHERE id = ?',
    [date, companyId ?? null, description, amount, receiptPhotoUri ?? null, id]
  );
}

export function updateExpensePayment(id: number, amountPaid: number, isLocked: number): void {
  const db = getDb();
  db.runSync(
    'UPDATE expenses SET amount_paid = ?, is_locked = ? WHERE id = ?',
    [amountPaid, isLocked, id]
  );
}

export function deleteExpense(id: number): void {
  const db = getDb();
  db.runSync('DELETE FROM expenses WHERE id = ?', [id]);
}
