import { getDb, Expense } from './schema';

function parseExpenseRow(row: any): Expense {
  return {
    ...row,
    receipt_uris: row.receipt_uris_json ? JSON.parse(row.receipt_uris_json) : [],
  };
}

const expenseSelectQuery = `
  SELECT e.*, c.name as company_name, c.color as company_color,
    (SELECT json_group_array(photo_uri) FROM (SELECT photo_uri FROM expense_receipt_photos WHERE expense_id = e.id ORDER BY sort_order)) as receipt_uris_json
  FROM expenses e
  LEFT JOIN companies c ON e.company_id = c.id
`;

export function getExpenseById(id: number): Expense | null {
  const db = getDb();
  const row = db.getFirstSync<any>(
    `${expenseSelectQuery} WHERE e.id = ?`,
    [id]
  );
  return row ? parseExpenseRow(row) : null;
}

export function getExpensesByDate(date: string): Expense[] {
  const db = getDb();
  const rows = db.getAllSync<any>(
    `${expenseSelectQuery}
     WHERE e.date = ? AND e.deleted_at IS NULL
     ORDER BY e.created_at ASC`,
    [date]
  );
  return rows.map(parseExpenseRow);
}

export function getExpensesByMonth(year: number, month: number): Expense[] {
  const db = getDb();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const rows = db.getAllSync<any>(
    `${expenseSelectQuery}
     WHERE e.date LIKE ? AND e.deleted_at IS NULL
     ORDER BY e.date ASC, e.created_at ASC`,
    [`${prefix}%`]
  );
  return rows.map(parseExpenseRow);
}

export function getAllUnpaidExpenses(): Expense[] {
  const db = getDb();
  const rows = db.getAllSync<any>(
    `${expenseSelectQuery}
     WHERE e.amount_paid < e.amount AND e.deleted_at IS NULL
     ORDER BY e.date ASC, e.created_at ASC`
  );
  return rows.map(parseExpenseRow);
}

export function insertExpense(
  date: string,
  companyId: number | null,
  description: string,
  amount: number,
  receiptUris: string[]
): number {
  const db = getDb();
  let expenseId = 0;
  db.withTransactionSync(() => {
    const result = db.runSync(
      'INSERT INTO expenses (date, company_id, description, amount, receipt_photo_uri) VALUES (?, ?, ?, ?, ?)',
      [date, companyId ?? null, description, amount, receiptUris.length > 0 ? receiptUris[0] : null]
    );
    expenseId = result.lastInsertRowId;
    receiptUris.forEach((uri, index) => {
      db.runSync(
        'INSERT INTO expense_receipt_photos (expense_id, photo_uri, sort_order) VALUES (?, ?, ?)',
        [expenseId, uri, index]
      );
    });
  });
  return expenseId;
}

export function updateExpense(
  id: number,
  date: string,
  companyId: number | null,
  description: string,
  amount: number,
  receiptUris: string[]
): void {
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync(
      'UPDATE expenses SET date = ?, company_id = ?, description = ?, amount = ?, receipt_photo_uri = ? WHERE id = ?',
      [date, companyId ?? null, description, amount, receiptUris.length > 0 ? receiptUris[0] : null, id]
    );
    db.runSync('DELETE FROM expense_receipt_photos WHERE expense_id = ?', [id]);
    receiptUris.forEach((uri, index) => {
      db.runSync(
        'INSERT INTO expense_receipt_photos (expense_id, photo_uri, sort_order) VALUES (?, ?, ?)',
        [id, uri, index]
      );
    });
  });
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
  db.runSync("UPDATE expenses SET deleted_at = datetime('now') WHERE id = ?", [id]);
}

export function restoreExpense(id: number): void {
  const db = getDb();
  db.runSync('UPDATE expenses SET deleted_at = NULL WHERE id = ?', [id]);
}
