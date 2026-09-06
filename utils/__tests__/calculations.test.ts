import {
  allocatePayments,
  calcDurationMinutes,
  calculateOutstanding,
  computeAmount,
  itemKey,
  openAmount,
  resolveRateOnEdit,
  roundMoney,
  sumAmounts,
  timeToMinutes,
  type PayableItem,
} from '../calculations';
import { formatDuration } from '../time';

describe('roundMoney', () => {
  it('rounds to whole cents', () => {
    expect(roundMoney(91.875)).toBe(91.88);
    expect(roundMoney(63)).toBe(63);
    expect(roundMoney(10)).toBe(10);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  it('never returns fractional cents even after chained arithmetic', () => {
    const total = roundMoney(roundMoney(91.875) + roundMoney(91.875));
    expect(total).toBe(183.76);
    expect(Number.isInteger(Math.round(total * 100))).toBe(true);
  });

  it('handles non-finite input defensively', () => {
    expect(roundMoney(NaN)).toBe(0);
    expect(roundMoney(Infinity)).toBe(0);
  });
});

describe('timeToMinutes / calcDurationMinutes', () => {
  it('parses HH:MM', () => {
    expect(timeToMinutes('08:15')).toBe(495);
    expect(timeToMinutes('00:00')).toBe(0);
  });

  it('computes a normal shift as raw minutes with no rounding', () => {
    expect(calcDurationMinutes('08:15', '17:00')).toBe(525);
    expect(calcDurationMinutes('09:00', '16:00')).toBe(420);
    expect(calcDurationMinutes('09:07', '17:03')).toBe(476);
  });

  it('treats an earlier end time as crossing midnight', () => {
    expect(calcDurationMinutes('22:00', '02:00')).toBe(240);
    expect(calcDurationMinutes('23:30', '00:15')).toBe(45);
  });

  it('returns 0 for equal times', () => {
    expect(calcDurationMinutes('12:00', '12:00')).toBe(0);
  });
});

describe('computeAmount', () => {
  it('is minutes / 60 * rate, rounded to cents', () => {
    expect(computeAmount(420, 9)).toBe(63);
    expect(computeAmount(525, 9)).toBe(78.75);
    expect(computeAmount(585, 9)).toBe(87.75);
  });

  it('rounds the half-cent that a quarter-hour shift at 10.50 produces', () => {
    // 8.75h * 10.5 = 91.875 -> stored as 91.88, not 91.875
    expect(computeAmount(525, 10.5)).toBe(91.88);
    expect(computeAmount(420, 10.5)).toBe(73.5);
  });

  it('is zero for a zero-length shift or a zero rate', () => {
    expect(computeAmount(0, 12)).toBe(0);
    expect(computeAmount(480, 0)).toBe(0);
  });
});

describe('resolveRateOnEdit (rate is frozen per entry)', () => {
  it('keeps the stored rate when the company is unchanged, even if the company rate has since changed', () => {
    // entry created at 9.00, company later raised to 10.50
    expect(resolveRateOnEdit(9, 1, 1, 10.5)).toBe(9);
  });

  it('adopts the new company rate only when the entry is moved to another company', () => {
    expect(resolveRateOnEdit(9, 1, 2, 12)).toBe(12);
  });
});

describe('calculateOutstanding', () => {
  it('is billed minus paid', () => {
    expect(calculateOutstanding(1803.38, 1638)).toBe(165.38);
  });

  it('goes negative when more was received than billed', () => {
    expect(calculateOutstanding(230, 250)).toBe(-20);
  });
});

describe('allocatePayments (FIFO)', () => {
  const items: PayableItem[] = [
    { id: 1, type: 'work', amount: 63 },
    { id: 2, type: 'work', amount: 63 },
    { id: 3, type: 'expense', amount: 40 },
  ];

  it('fills the oldest items first', () => {
    const result = allocatePayments(items, 100);
    expect(result.paidByItem.get('work-1')).toBe(63);
    expect(result.paidByItem.get('work-2')).toBe(37);
    expect(result.paidByItem.get('expense-3')).toBe(0);
    expect([...result.fullyPaid]).toEqual(['work-1']);
    expect(result.credit).toBe(0);
  });

  it('marks items fully paid and reports no credit on an exact payoff', () => {
    const result = allocatePayments(items, 166);
    expect(result.fullyPaid).toEqual(new Set(['work-1', 'work-2', 'expense-3']));
    expect(result.credit).toBe(0);
  });

  it('keeps money beyond the total billed as a forward credit instead of dropping it', () => {
    const result = allocatePayments(items, 200);
    expect(result.credit).toBe(34);
    expect(result.fullyPaid.size).toBe(3);
  });

  it('leaves every item at zero for a zero payment', () => {
    const result = allocatePayments(items, 0);
    expect(result.paidByItem.get('work-1')).toBe(0);
    expect(result.credit).toBe(0);
  });

  it('produces per-item paid amounts that always sum back to the money applied', () => {
    const paidOut = 149.5;
    const result = allocatePayments(items, paidOut);
    const distributed = sumAmounts([...result.paidByItem.values()]);
    expect(roundMoney(distributed + result.credit)).toBe(paidOut);
  });
});

/**
 * Regression test built from the real backup (uren-backup-1788617324952.json).
 *
 * It reproduces what recalculateAllPayments() does — allocate the payment total
 * over every active entry, FIFO — and checks the property that was broken
 * before: the openstaande lijst and the "billed - paid" balance must be equal.
 */
describe('backup reconciliation: Fabian Eppens', () => {
  // company_id 1 (Actg): 9.00 through entry 24, raised to 10.50 from entry 25.
  const rateFor = (id: number) => (id >= 25 ? 10.5 : 9);
  const durations: Record<number, number> = {
    1: 420, 2: 420, 3: 420, 4: 420, 5: 420, 6: 420, 7: 420,
    9: 540, 10: 525, 11: 420, 12: 525, 13: 540, 14: 540, 15: 525, 16: 525,
    17: 585, 18: 420, 19: 615, 20: 540, 21: 420, 22: 420, 23: 420, 24: 420,
    25: 525, 26: 420,
  };
  // entry 8 was created and soft-deleted the same minute -> excluded entirely.
  const activeIds = Object.keys(durations).map(Number).sort((a, b) => a - b);

  const items: PayableItem[] = activeIds.map((id) => ({
    id,
    type: 'work',
    amount: computeAmount(durations[id], rateFor(id)),
  }));

  const paymentAmounts = [10, 70, 361, 55, 125, 200, 220, 115, 250, 232];
  const totalPaid = sumAmounts(paymentAmounts);
  const totalBilled = sumAmounts(items.map((i) => i.amount));

  it('bills 1803.38 and has received 1638.00', () => {
    expect(totalPaid).toBe(1638);
    expect(totalBilled).toBe(1803.38);
  });

  it('shows an outstanding balance of 165.38', () => {
    expect(calculateOutstanding(totalBilled, totalPaid)).toBe(165.38);
  });

  it('leaves exactly the last two shifts open and everything before them paid', () => {
    const result = allocatePayments(items, totalPaid);
    const stillOpen = items
      .filter((i) => !result.fullyPaid.has(itemKey(i)))
      .map((i) => i.id);
    expect(stillOpen).toEqual([25, 26]);
    // entry 24 was the phantom "20 euro still owing" in the old app
    expect(result.fullyPaid.has('work-24')).toBe(true);
    expect(result.credit).toBe(0);
  });

  it('makes the openstaande lijst add up to the balance (the bug)', () => {
    const result = allocatePayments(items, totalPaid);
    const listTotal = sumAmounts(
      items.map((i) => openAmount(i.amount, result.paidByItem.get(itemKey(i)) ?? 0))
    );
    expect(listTotal).toBe(calculateOutstanding(totalBilled, totalPaid));
    expect(listTotal).toBe(165.38);
  });

  it('never reprices an old shift when the rate changes: entry 24 stays at 63.00', () => {
    const entry24 = items.find((i) => i.id === 24)!;
    expect(entry24.amount).toBe(63);
    expect(computeAmount(durations[24], rateFor(26))).toBe(73.5); // what it would wrongly become
  });
});

describe('formatDuration', () => {
  it('always renders as "Xu Ym"', () => {
    expect(formatDuration(525)).toBe('8u 45m');
    expect(formatDuration(420)).toBe('7u');
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(0)).toBe('0m');
  });
});
