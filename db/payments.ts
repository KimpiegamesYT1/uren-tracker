import { getDb, Payment } from './schema';
import {
  allocatePayments,
  calculateOutstanding,
  itemKey,
  roundMoney,
  type PayableItem,
} from '../utils/calculations';

/**
 * All open work entries and expenses, oldest first. This is the FIFO order in
 * which received money is applied: by date, then by creation time, then work
 * before expenses on the same moment, then start time, then id.
 */
function getPayableItems(): PayableItem[] {
  const db = getDb();
  return db.getAllSync<PayableItem>(
    `SELECT id, 'work' as type, amount, date, created_at,
            start_time as sort_time, 0 as type_priority
     FROM work_entries
     WHERE deleted_at IS NULL
     UNION ALL
     SELECT id, 'expense' as type, amount, date, created_at,
            '' as sort_time, 1 as type_priority
     FROM expenses
     WHERE deleted_at IS NULL
     ORDER BY date ASC, created_at ASC, type_priority ASC, sort_time ASC, id ASC`
  );
}

export function getAllPayments(): Payment[] {
  const db = getDb();
  return db.getAllSync<Payment>(
    'SELECT * FROM payments ORDER BY date DESC, created_at DESC'
  );
}

export function insertPayment(date: string, amount: number, note: string): number {
  const db = getDb();
  const result = db.runSync(
    'INSERT INTO payments (date, amount, note) VALUES (?, ?, ?)',
    [date, roundMoney(amount), note]
  );
  return result.lastInsertRowId;
}

export function deletePayment(id: number): void {
  const db = getDb();
  db.runSync('DELETE FROM payments WHERE id = ?', [id]);
}

/**
 * Rebuilds every `amount_paid` / `is_locked` value from scratch.
 *
 * This is the single source of truth for what has been paid: it takes the sum
 * of the payments table and distributes it, FIFO, over all active items. It
 * must run after any change to a payment OR to a work entry / expense, so the
 * per-item view can never drift from the "billed - paid" balance. Money beyond
 * the total billed simply stays unallocated and reappears the next time this
 * runs (for example once a new entry is added).
 */
export function recalculateAllPayments(): void {
  const db = getDb();
  db.execSync('BEGIN IMMEDIATE TRANSACTION');
  try {
    const totalPaid =
      db.getFirstSync<{ total: number }>('SELECT COALESCE(SUM(amount), 0) as total FROM payments')
        ?.total ?? 0;

    const items = getPayableItems();
    const allocation = allocatePayments(items, totalPaid);

    db.runSync('UPDATE work_entries SET amount_paid = 0, is_locked = 0 WHERE deleted_at IS NULL');
    db.runSync('UPDATE expenses SET amount_paid = 0, is_locked = 0 WHERE deleted_at IS NULL');

    for (const item of items) {
      const key = itemKey(item);
      const paid = allocation.paidByItem.get(key) ?? 0;
      if (paid <= 0) continue;
      const table = item.type === 'work' ? 'work_entries' : 'expenses';
      db.runSync(`UPDATE ${table} SET amount_paid = ?, is_locked = ? WHERE id = ?`, [
        paid,
        allocation.fullyPaid.has(key) ? 1 : 0,
        item.id,
      ]);
    }

    db.execSync('COMMIT');
  } catch (error) {
    db.execSync('ROLLBACK');
    throw error;
  }
}

/** Registers a received payment and re-applies all payments. */
export function insertPaymentAndRecalculate(date: string, amount: number, note: string): number {
  const id = insertPayment(date, amount, note);
  recalculateAllPayments();
  return id;
}

export function deletePaymentAndRecalculate(id: number): void {
  deletePayment(id);
  recalculateAllPayments();
}

export function updatePayment(id: number, amount: number, note: string, date: string): void {
  const db = getDb();
  db.runSync('UPDATE payments SET amount = ?, note = ?, date = ? WHERE id = ?', [
    roundMoney(amount),
    note,
    date,
    id,
  ]);
  recalculateAllPayments();
}

/**
 * Outstanding balance: sum of all work entry and expense amounts minus the sum
 * of all registered payments. Negative means more was received than billed.
 */
export function calculateBalance(): number {
  const db = getDb();
  const result = db.getFirstSync<{ billed: number; paid: number }>(`
    SELECT
      (SELECT COALESCE(SUM(amount), 0) FROM work_entries WHERE deleted_at IS NULL)
      + (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE deleted_at IS NULL) AS billed,
      (SELECT COALESCE(SUM(amount), 0) FROM payments) AS paid
  `);
  return calculateOutstanding(result?.billed ?? 0, result?.paid ?? 0);
}
