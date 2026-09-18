import type { Transaction, Category, Subscription, ProfileFilter } from "./types";
import { isInMonth } from "./format";

/**
 * Month arithmetic, defined once.
 *
 * The Dashboard and the PDF report previously computed this separately and
 * both made the same mistake: a subscription's expected amount was subtracted
 * as a "committed" outflow even when the matching transaction had already been
 * imported from the bank statement, so every paid subscription was counted
 * twice and no closing balance ever reconciled.
 *
 * A subscription is treated as a forecast that a real transaction fulfils.
 * Only subscriptions with no matching transaction are still owed.
 */

export interface CategoryTotal {
  credit: number;
  debit: number;
}

export interface MonthReconciliation {
  /** Money in, from real transactions. */
  credit: number;
  /** Money out, from real transactions. */
  debit: number;
  /** Expected amounts for subscriptions with no matching transaction yet. */
  stillExpected: number;
  byCategory: Map<string, CategoryTotal>;
  /** Subscriptions matched to a transaction this month. */
  fulfilled: Subscription[];
  /** Active subscriptions with nothing matching them yet. */
  outstanding: Subscription[];
  /** credit − debit − stillExpected */
  net: number;
}

export function filterByProfile<T extends { profile: string }>(items: T[], profile: ProfileFilter): T[] {
  if (profile === "combined") return items;
  return items.filter((i) => i.profile === profile);
}

/** Transactions belonging to one calendar month, oldest first. */
export function transactionsForMonth(txs: Transaction[], month: Date): Transaction[] {
  return txs.filter((t) => isInMonth(t.date, month)).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Does this transaction plausibly settle this subscription?
 *
 * Same category, and an amount within the larger of 25% or 5 units — utilities
 * and phone bills vary month to month, so an exact match is too strict.
 */
function fulfils(t: Transaction, s: Subscription): boolean {
  if (t.categoryId !== s.categoryId) return false;
  if (t.profile !== s.profile) return false;
  const tolerance = Math.max(s.expectedAmount * 0.25, 5);
  return Math.abs(Math.abs(t.amount) - s.expectedAmount) <= tolerance;
}

export function reconcileMonth(
  monthTx: Transaction[],
  categories: Category[],
  subscriptions: Subscription[]
): MonthReconciliation {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const byCategory = new Map<string, CategoryTotal>();
  let credit = 0;
  let debit = 0;

  for (const t of monthTx) {
    const c = catMap.get(t.categoryId);
    if (!c) continue; // category was deleted; not attributable
    const amount = Math.abs(t.amount);
    const entry = byCategory.get(c.id) ?? { credit: 0, debit: 0 };
    if (c.type === "income") {
      credit += amount;
      entry.credit += amount;
    } else {
      debit += amount;
      entry.debit += amount;
    }
    byCategory.set(c.id, entry);
  }

  // Match each active subscription against an as-yet-unclaimed transaction.
  const claimed = new Set<string>();
  const fulfilled: Subscription[] = [];
  const outstanding: Subscription[] = [];

  for (const s of subscriptions.filter((x) => x.active)) {
    const hit = monthTx.find((t) => !claimed.has(t.id) && fulfils(t, s));
    if (hit) {
      claimed.add(hit.id);
      fulfilled.push(s);
    } else {
      outstanding.push(s);
    }
  }

  const stillExpected = outstanding.reduce((sum, s) => sum + s.expectedAmount, 0);

  return { credit, debit, stillExpected, byCategory, fulfilled, outstanding, net: credit - debit - stillExpected };
}

/**
 * Running balances across a span of months.
 *
 * Each month's closing balance is the next month's opening balance, which is
 * what makes the report's balance column mean anything.
 */
export interface MonthLedgerRow {
  month: Date;
  opening: number;
  closing: number;
  recon: MonthReconciliation;
  transactions: Transaction[];
}

export function buildLedger(
  months: Date[],
  transactions: Transaction[],
  categories: Category[],
  subscriptions: Subscription[],
  openingBalance: number
): MonthLedgerRow[] {
  let running = openingBalance;
  return months.map((month) => {
    const monthTx = transactionsForMonth(transactions, month);
    const recon = reconcileMonth(monthTx, categories, subscriptions);
    const opening = running;
    const closing = opening + recon.net;
    running = closing;
    return { month, opening, closing, recon, transactions: monthTx };
  });
}
