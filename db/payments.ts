import { getDb, Payment } from './schema';
import { getAllUnpaidWorkEntries, updateWorkEntryPayment } from './work-entries';
import { getAllUnpaidExpenses, updateExpensePayment } from './expenses';

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
 * Resets all work entries and expenses to unpaid, then re-applies all payments in chronological order.
 */
export function recalculateAllPayments(): void {
  const db = getDb();
  db.runSync('UPDATE work_entries SET amount_paid = 0, is_locked = 0');
  db.runSync('UPDATE expenses SET amount_paid = 0, is_locked = 0');

  const payments = db.getAllSync<Payment>(
    'SELECT * FROM payments ORDER BY date ASC, created_at ASC'
  );

  for (const payment of payments) {
    applyPayment(payment.amount);
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
  type UnpaidItem = {
    id: number;
    type: 'work' | 'expense';
    date: string;
    created_at: string;
    amount: number;
    amount_paid: number;
  };

  const workEntries = getAllUnpaidWorkEntries().map((e) => ({
    id: e.id,
    type: 'work' as const,
    date: e.date,
    created_at: e.created_at,
    amount: e.amount,
    amount_paid: e.amount_paid,
  }));

  const expenses = getAllUnpaidExpenses().map((e) => ({
    id: e.id,
    type: 'expense' as const,
    date: e.date,
    created_at: e.created_at,
    amount: e.amount,
    amount_paid: e.amount_paid,
  }));

  // Combine and sort by date ASC, then created_at ASC (FIFO)
  const items: UnpaidItem[] = [...workEntries, ...expenses].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.created_at.localeCompare(b.created_at);
  });

  let remaining = amount;

  for (const item of items) {
    if (remaining <= 0) break;

    const outstanding = item.amount - item.amount_paid;
    const toPay = Math.min(outstanding, remaining);
    const newAmountPaid = item.amount_paid + toPay;
    const isFullyPaid = Math.abs(newAmountPaid - item.amount) < 0.001;
    remaining -= toPay;

    if (item.type === 'work') {
      updateWorkEntryPayment(item.id, newAmountPaid, isFullyPaid ? 1 : 0);
    } else {
      updateExpensePayment(item.id, newAmountPaid, isFullyPaid ? 1 : 0);
    }
  }
}

export function calculateBalance(): number {
  const db = getDb();
  const workResult = db.getFirstSync<{ total: number }>(
    'SELECT COALESCE(SUM(amount), 0) as total FROM work_entries'
  );
  const expenseResult = db.getFirstSync<{ total: number }>(
    'SELECT COALESCE(SUM(amount), 0) as total FROM expenses'
  );
  const paymentResult = db.getFirstSync<{ total: number }>(
    'SELECT COALESCE(SUM(amount), 0) as total FROM payments'
  );
  return (workResult?.total ?? 0) + (expenseResult?.total ?? 0) - (paymentResult?.total ?? 0);
}
