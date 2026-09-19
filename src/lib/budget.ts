import type { Transaction, Category, Subscription, ProfileFilter, Account, AccountStatement, BillPayment } from "./types";
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
  subscriptions: Subscription[],
  /**
   * Explicit "this bill was paid by that transaction" links, which take
   * priority over the amount heuristic below. Without them a Spotify charge
   * could settle a gym membership just because the amounts were close.
   */
  billPayments: BillPayment[] = []
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

  // An explicit link beats the heuristic, and claims its transaction first so
  // the heuristic cannot hand the same one to a different subscription.
  const paid = new Map<string, string | undefined>();
  for (const p of billPayments) {
    if (p.paid) paid.set(p.subscriptionId, p.transactionId);
  }
  for (const t of monthTx) {
    for (const [, txId] of paid) if (txId === t.id) claimed.add(t.id);
  }

  for (const s of subscriptions.filter((x) => x.active)) {
    if (paid.has(s.id)) { fulfilled.push(s); continue; }
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

// ─── ACCOUNTS ──────────────────────────────────────────
//
// Purely additive: buildLedger and reconcileMonth are untouched, so every
// existing test keeps passing verbatim.

/** The default account id created by migration for pre-accounts data. */
export const DEFAULT_ACCOUNT_ID = "acct-main";

/**
 * Which account a transaction belongs to.
 *
 * accountId is optional, so anything written before accounts existed falls
 * back to the default account (or, failing that, the first one).
 */
export function accountOf(t: Transaction, accounts: Account[]): Account | undefined {
  if (t.accountId) {
    const exact = accounts.find((a) => a.id === t.accountId);
    if (exact) return exact;
  }
  return accounts.find((a) => a.id === DEFAULT_ACCOUNT_ID) ?? accounts[0];
}

/**
 * Balance of one account, optionally as at a date (inclusive).
 *
 * Transactions store a POSITIVE amount and take their direction from the
 * category, exactly as reconcileMonth does — including skipping transactions
 * whose category has been deleted, since those are not attributable.
 */
export function accountBalance(
  account: Account,
  txs: Transaction[],
  categories: Category[],
  upToISO?: string
): number {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  let balance = account.openingBalance;

  for (const t of txs) {
    if (t.date < account.openingDate) continue;       // predates the account
    if (upToISO && t.date > upToISO) continue;
    if ((t.accountId ?? DEFAULT_ACCOUNT_ID) !== account.id) continue;
    const c = catMap.get(t.categoryId);
    if (!c) continue;
    balance += c.type === "income" ? Math.abs(t.amount) : -Math.abs(t.amount);
  }
  return balance;
}

export function balancesByAccount(
  accounts: Account[],
  txs: Transaction[],
  categories: Category[],
  upToISO?: string
): Map<string, number> {
  return new Map(accounts.map((a) => [a.id, accountBalance(a, txs, categories, upToISO)]));
}

/** Combined balance of the given accounts the day before `beforeISO`. */
export function openingBalanceFor(
  accounts: Account[],
  txs: Transaction[],
  categories: Category[],
  beforeISO: string,
  accountIds?: string[]
): number {
  const scope = accountIds ? accounts.filter((a) => accountIds.includes(a.id)) : accounts;
  // Exclusive of beforeISO: the opening balance is what was held going in.
  const previousDay = isoBefore(beforeISO);
  return scope.reduce((sum, a) => sum + accountBalance(a, txs, categories, previousDay), 0);
}

function isoBefore(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(+m[1], +m[2] - 1, +m[3] - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface AccountReconciliation {
  accountId: string;
  year: number;
  month: number;
  /** What the app thinks the account closed at. */
  computed: number;
  /** What the bank says, when the user has entered it. */
  actual: number | null;
  delta: number;
  reconciled: boolean;
}

/**
 * Compare the computed closing balance against the bank's own figure.
 *
 * Compared with a tolerance, never with ===: accumulating floating-point
 * amounts across a year will not land exactly on the bank's number.
 */
export function reconcileAccountMonth(
  account: Account,
  txs: Transaction[],
  categories: Category[],
  statement: AccountStatement | undefined,
  tolerance = 0.005
): AccountReconciliation {
  const year = statement?.year ?? new Date().getFullYear();
  const month = statement?.month ?? new Date().getMonth();
  const lastDay = new Date(year, month + 1, 0);
  const upTo = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

  const computed = accountBalance(account, txs, categories, upTo);
  const actual = statement?.closingBalance ?? null;
  const delta = actual === null ? 0 : computed - actual;

  return {
    accountId: account.id, year, month, computed, actual, delta,
    reconciled: actual !== null && Math.abs(delta) <= tolerance,
  };
}
