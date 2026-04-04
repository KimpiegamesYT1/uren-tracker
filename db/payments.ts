import { getDb, Payment } from './schema';

type FifoItem = {
  id: number;
  type: 'work' | 'expense';
  amount: number;
  amount_paid: number;
};

function getFifoItems(unpaidOnly: boolean): FifoItem[] {
  const db = getDb();
  const unpaidFilter = unpaidOnly ? 'AND amount_paid < amount' : '';
  return db.getAllSync<FifoItem>(
    `SELECT id, 'work' as type, amount, amount_paid, date, created_at,
            start_time as sort_time, 0 as type_priority
     FROM work_entries
     WHERE deleted_at IS NULL ${unpaidFilter}
     UNION ALL
     SELECT id, 'expense' as type, amount, amount_paid, date, created_at,
            '' as sort_time, 1 as type_priority
     FROM expenses
     WHERE deleted_at IS NULL ${unpaidFilter}
     ORDER BY date ASC, created_at ASC, type_priority ASC, sort_time ASC, id ASC`
  );
}

function applyAmountToItems(items: FifoItem[], amount: number): void {
  const db = getDb();
  let remaining = amount;

  for (const item of items) {
    if (remaining <= 0) break;

    const outstanding = item.amount - item.amount_paid;
    if (outstanding <= 0) continue;

    const toPay = Math.min(outstanding, remaining);
    const newAmountPaid = item.amount_paid + toPay;
    const isFullyPaid = Math.abs(newAmountPaid - item.amount) < 0.001;

    if (item.type === 'work') {
      db.runSync('UPDATE work_entries SET amount_paid = ?, is_locked = ? WHERE id = ?', [
        newAmountPaid,
        isFullyPaid ? 1 : 0,
        item.id,
      ]);
    } else {
      db.runSync('UPDATE expenses SET amount_paid = ?, is_locked = ? WHERE id = ?', [
        newAmountPaid,
        isFullyPaid ? 1 : 0,
        item.id,
      ]);
    }

    remaining -= toPay;
  }
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
    [date, amount, note]
  );
  return result.lastInsertRowId;
}

export function deletePayment(id: number): void {
  const db = getDb();
  db.runSync('DELETE FROM payments WHERE id = ?', [id]);
}

/**
 * Recalculates all payment applications from scratch.
 * Resets all work entries and expenses to unpaid, then re-applies the total
 * paid amount over all items in FIFO order.
 * Must be called after any payment is deleted or updated to keep amount_paid consistent.
 */
export function recalculateAllPayments(): void {
  const db = getDb();
  db.execSync('BEGIN IMMEDIATE TRANSACTION');
  try {
    db.runSync('UPDATE work_entries SET amount_paid = 0, is_locked = 0 WHERE deleted_at IS NULL');
    db.runSync('UPDATE expenses SET amount_paid = 0, is_locked = 0 WHERE deleted_at IS NULL');

    const totalPaid = db.getFirstSync<{ total: number }>(
      'SELECT COALESCE(SUM(amount), 0) as total FROM payments'
    )?.total ?? 0;

    if (totalPaid > 0) {
      applyAmountToItems(getFifoItems(false), totalPaid);
    }

    db.execSync('COMMIT');
  } catch (error) {
    db.execSync('ROLLBACK');
    throw error;
  }
}

export function deletePaymentAndRecalculate(id: number): void {
  deletePayment(id);
  recalculateAllPayments();
}

export function updatePayment(id: number, amount: number, note: string): void {
  const db = getDb();
  db.runSync('UPDATE payments SET amount = ?, note = ? WHERE id = ?', [amount, note, id]);
  recalculateAllPayments();
}

/**
 * FIFO payment processing:
 * Distributes `amount` over the oldest unpaid work entries and expenses,
 * updating amount_paid and is_locked accordingly.
 */
export function applyPayment(amount: number): void {
  if (amount <= 0) return;

  const db = getDb();
  db.execSync('BEGIN IMMEDIATE TRANSACTION');
  try {
    applyAmountToItems(getFifoItems(true), amount);
    db.execSync('COMMIT');
  } catch (error) {
    db.execSync('ROLLBACK');
    throw error;
  }
}

/**
 * Calculates the total outstanding balance: sum of all work entry and expense amounts
 * minus the sum of all registered payments.
 */
export function calculateBalance(): number {
  const db = getDb();
  const result = db.getFirstSync<{ balance: number }>(`
    SELECT
      (SELECT COALESCE(SUM(amount), 0) FROM work_entries WHERE deleted_at IS NULL)
      + (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE deleted_at IS NULL)
      - (SELECT COALESCE(SUM(amount), 0) FROM payments)
      AS balance
  `);
  return result?.balance ?? 0;
}
