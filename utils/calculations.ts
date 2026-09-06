/**
 * Pure calculation core for the hours tracker.
 *
 * Nothing in this file may import React Native, Expo or the database layer:
 * every function here is a plain input -> output transformation so it can be
 * exercised directly by the unit tests in ./__tests__/calculations.test.ts.
 *
 * Money is always handled in euros as a number rounded to whole cents. Use
 * `roundMoney` on every intermediate result so that summing a list of amounts
 * and formatting the total can never drift apart by a fraction of a cent.
 */

/** Rounds a euro amount to whole cents (2 decimals), half away from zero. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Nudge by a tiny epsilon so values like 91.875 that are the result of an
  // exact division land on the expected cent instead of a float artefact.
  const cents = Math.round(value * 100 + (value >= 0 ? Number.EPSILON : -Number.EPSILON) * 100);
  return cents / 100;
}

/** Parses a "HH:MM" string into minutes since midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Minutes between two "HH:MM" strings. If the end is not after the start it is
 * treated as crossing midnight (e.g. 22:00 -> 02:00 = 240 minutes). Equal times
 * yield 0.
 */
export function calcDurationMinutes(startTime: string, endTime: string): number {
  const start = timeToMinutes(startTime);
  let end = timeToMinutes(endTime);
  if (end < start) end += 24 * 60;
  return end - start;
}

/**
 * The amount a work entry is worth: minutes / 60 * hourly rate, rounded to
 * whole cents. This is the single definition used when creating and when
 * editing an entry.
 */
export function computeAmount(durationMinutes: number, hourlyRate: number): number {
  if (durationMinutes <= 0 || hourlyRate <= 0) return 0;
  return roundMoney((durationMinutes / 60) * hourlyRate);
}

/**
 * Which hourly rate an entry should use after an edit.
 *
 * The rate is frozen on the entry when it is created. Editing an entry keeps
 * that frozen rate, so changing a company's rate in Settings only affects
 * entries created from then on. The one exception is moving an entry to a
 * different company: then it adopts the newly chosen company's current rate,
 * because the old frozen rate belonged to a different company.
 */
export function resolveRateOnEdit(
  storedRate: number,
  storedCompanyId: number,
  selectedCompanyId: number,
  selectedCompanyRate: number
): number {
  return selectedCompanyId === storedCompanyId ? storedRate : selectedCompanyRate;
}

export type PayableItem = {
  id: number;
  type: 'work' | 'expense';
  amount: number;
};

export type PaymentAllocation = {
  /** key `${type}-${id}` -> amount paid towards that item (whole cents) */
  paidByItem: Map<string, number>;
  /** keys of items that are fully covered */
  fullyPaid: Set<string>;
  /** money received beyond the total billed, kept as a forward credit */
  credit: number;
};

export function itemKey(item: Pick<PayableItem, 'id' | 'type'>): string {
  return `${item.type}-${item.id}`;
}

/**
 * Distributes `totalPaid` over `items` in the given (FIFO) order.
 *
 * `items` must already be sorted oldest-first. Every item ends up in
 * `paidByItem` (with 0 when nothing reached it). Any money left after the last
 * item is returned as `credit` rather than silently dropped, so the per-item
 * view and the "total billed - total paid" balance always agree.
 */
export function allocatePayments(items: PayableItem[], totalPaid: number): PaymentAllocation {
  const paidByItem = new Map<string, number>();
  const fullyPaid = new Set<string>();
  let remaining = roundMoney(Math.max(0, totalPaid));

  for (const item of items) {
    const key = itemKey(item);
    const amount = roundMoney(Math.max(0, item.amount));

    if (remaining <= 0 || amount <= 0) {
      paidByItem.set(key, 0);
      if (amount <= 0) fullyPaid.add(key);
      continue;
    }

    const paid = roundMoney(Math.min(amount, remaining));
    paidByItem.set(key, paid);
    if (paid >= amount - 0.005) fullyPaid.add(key);
    remaining = roundMoney(remaining - paid);
  }

  return { paidByItem, fullyPaid, credit: roundMoney(Math.max(0, remaining)) };
}

/** Sum of a list of amounts, rounded to whole cents. */
export function sumAmounts(amounts: number[]): number {
  return roundMoney(amounts.reduce((total, value) => total + value, 0));
}

/**
 * Outstanding balance: everything billed minus everything received. Negative
 * means more was received than billed (a credit).
 */
export function calculateOutstanding(totalBilled: number, totalPaid: number): number {
  return roundMoney(totalBilled - totalPaid);
}

/** Open amount for a single item, never below zero, in whole cents. */
export function openAmount(amount: number, amountPaid: number): number {
  return roundMoney(Math.max(0, amount - amountPaid));
}

/** A tiny tolerance used when comparing money, to absorb float noise. */
export const MONEY_EPSILON = 0.005;

/** Whether an item still has money owing on it. */
export function isUnpaid(amount: number, amountPaid: number): boolean {
  return amount - amountPaid > MONEY_EPSILON;
}
