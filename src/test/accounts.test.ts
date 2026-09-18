import { describe, it, expect } from "vitest";
import {
  DEFAULT_ACCOUNT_ID, accountBalance, accountOf, balancesByAccount,
  openingBalanceFor, reconcileAccountMonth,
} from "@/lib/budget";
import { upgradeDocument } from "@/lib/vault/upgrade";
import type { Account, Category, Transaction } from "@/lib/types";

const cats: Category[] = [
  { id: "sal", name: "Salary", type: "income", profileDefault: "personal", monthlyBudget: 0, genericLabel: "Income" },
  { id: "food", name: "Groceries", type: "expenses", profileDefault: "household", monthlyBudget: 400, genericLabel: "Food" },
  { id: "save", name: "Savings", type: "savings", profileDefault: "household", monthlyBudget: 0, genericLabel: "Savings" },
];

const acct = (over: Partial<Account> = {}): Account => ({
  id: DEFAULT_ACCOUNT_ID, name: "Main", type: "checking", currency: "EUR",
  openingBalance: 1000, openingDate: "2026-01-01", ...over,
});

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: Math.random().toString(36).slice(2),
  date: "2026-04-10", amount: 100, categoryId: "food", profile: "household",
  payee: "", description: "", isVague: false, ...over,
});

describe("accountBalance", () => {
  it("uses the category to decide direction, not the sign of the amount", () => {
    // Amounts are stored positive; income adds and everything else subtracts.
    const a = acct({ openingBalance: 0 });
    expect(accountBalance(a, [tx({ amount: 500, categoryId: "sal" })], cats)).toBe(500);
    expect(accountBalance(a, [tx({ amount: 500, categoryId: "food" })], cats)).toBe(-500);
    // Savings is an outflow from the account it leaves.
    expect(accountBalance(a, [tx({ amount: 200, categoryId: "save" })], cats)).toBe(-200);
  });

  it("starts from the opening balance", () => {
    expect(accountBalance(acct(), [tx({ amount: 250 })], cats)).toBe(750);
  });

  it("excludes transactions whose category was deleted", () => {
    // Matches reconcileMonth: an unattributable transaction is not counted.
    expect(accountBalance(acct(), [tx({ amount: 100, categoryId: "gone" })], cats)).toBe(1000);
  });

  it("ignores transactions from other accounts", () => {
    const wise = acct({ id: "wise", openingBalance: 0 });
    const txs = [tx({ amount: 100, accountId: DEFAULT_ACCOUNT_ID }), tx({ amount: 40, accountId: "wise" })];
    expect(accountBalance(wise, txs, cats)).toBe(-40);
  });

  it("treats a transaction with no accountId as belonging to the default account", () => {
    expect(accountBalance(acct({ openingBalance: 0 }), [tx({ amount: 30 })], cats)).toBe(-30);
  });

  it("ignores anything dated before the account opened", () => {
    const a = acct({ openingBalance: 0, openingDate: "2026-04-01" });
    expect(accountBalance(a, [tx({ date: "2026-03-31", amount: 999 }), tx({ date: "2026-04-02", amount: 10 })], cats)).toBe(-10);
  });

  it("honours an as-at date, inclusive", () => {
    const a = acct({ openingBalance: 0 });
    const txs = [tx({ date: "2026-04-10", amount: 10 }), tx({ date: "2026-04-11", amount: 20 })];
    expect(accountBalance(a, txs, cats, "2026-04-10")).toBe(-10);
    expect(accountBalance(a, txs, cats, "2026-04-11")).toBe(-30);
  });
});

describe("balancesByAccount and openingBalanceFor", () => {
  it("reports each account separately", () => {
    const accounts = [acct({ openingBalance: 100 }), acct({ id: "wise", name: "Wise", openingBalance: 50 })];
    const txs = [tx({ amount: 30, accountId: DEFAULT_ACCOUNT_ID }), tx({ amount: 20, accountId: "wise" })];
    const m = balancesByAccount(accounts, txs, cats);
    expect(m.get(DEFAULT_ACCOUNT_ID)).toBe(70);
    expect(m.get("wise")).toBe(30);
  });

  it("gives the combined balance going INTO a month, excluding that month", () => {
    const accounts = [acct({ openingBalance: 1000 })];
    const txs = [tx({ date: "2026-03-20", amount: 100 }), tx({ date: "2026-04-05", amount: 500 })];
    // March's 100 counts; April's 500 does not.
    expect(openingBalanceFor(accounts, txs, cats, "2026-04-01")).toBe(900);
  });

  it("can be scoped to selected accounts", () => {
    const accounts = [acct({ openingBalance: 100 }), acct({ id: "wise", openingBalance: 50 })];
    expect(openingBalanceFor(accounts, [], cats, "2026-04-01")).toBe(150);
    expect(openingBalanceFor(accounts, [], cats, "2026-04-01", ["wise"])).toBe(50);
  });
});

describe("reconcileAccountMonth", () => {
  const statement = (closing: number) => ({
    id: "s", accountId: DEFAULT_ACCOUNT_ID, year: 2026, month: 3, closingBalance: closing, enteredAt: "",
  });

  it("reconciles when the bank agrees", () => {
    const r = reconcileAccountMonth(acct({ openingBalance: 1000 }), [tx({ amount: 250 })], cats, statement(750));
    expect(r.computed).toBe(750);
    expect(r.reconciled).toBe(true);
    expect(r.delta).toBe(0);
  });

  it("reports the gap when it does not", () => {
    const r = reconcileAccountMonth(acct({ openingBalance: 1000 }), [tx({ amount: 250 })], cats, statement(700));
    expect(r.reconciled).toBe(false);
    expect(r.delta).toBeCloseTo(50);
  });

  it("tolerates sub-cent floating point drift instead of demanding equality", () => {
    // 0.1 + 0.2 style accumulation across a year will never land exactly.
    const txs = Array.from({ length: 3 }, () => tx({ amount: 0.1 }));
    const r = reconcileAccountMonth(acct({ openingBalance: 0 }), txs, cats, statement(-0.3));
    expect(r.reconciled).toBe(true);
  });

  it("is not reconciled when no statement has been entered", () => {
    const r = reconcileAccountMonth(acct(), [], cats, undefined);
    expect(r.actual).toBeNull();
    expect(r.reconciled).toBe(false);
  });

  it("counts only up to the end of the stated month", () => {
    const txs = [tx({ date: "2026-04-30", amount: 10 }), tx({ date: "2026-05-01", amount: 999 })];
    const r = reconcileAccountMonth(acct({ openingBalance: 100 }), txs, cats, statement(90));
    expect(r.computed).toBe(90);
    expect(r.reconciled).toBe(true);
  });
});

describe("accountOf", () => {
  it("resolves by id, then falls back to the default account", () => {
    const accounts = [acct(), acct({ id: "wise", name: "Wise" })];
    expect(accountOf(tx({ accountId: "wise" }), accounts)!.name).toBe("Wise");
    expect(accountOf(tx({}), accounts)!.id).toBe(DEFAULT_ACCOUNT_ID);
    expect(accountOf(tx({ accountId: "deleted" }), accounts)!.id).toBe(DEFAULT_ACCOUNT_ID);
  });

  it("returns undefined when there are no accounts at all", () => {
    expect(accountOf(tx({}), [])).toBeUndefined();
  });
});

describe("upgradeDocument", () => {
  it("creates a Main account and backfills accountId", () => {
    const doc = upgradeDocument({ transactions: [tx({ date: "2026-02-05" }), tx({ date: "2026-01-09" })] });
    expect(doc.schema).toBe(2);
    expect(doc.accounts).toHaveLength(1);
    expect(doc.accounts[0].id).toBe(DEFAULT_ACCOUNT_ID);
    // Opens on the earliest transaction, so no history is excluded.
    expect(doc.accounts[0].openingDate).toBe("2026-01-09");
    expect(doc.transactions.every((t) => t.accountId === DEFAULT_ACCOUNT_ID)).toBe(true);
  });

  it("is idempotent", () => {
    const once = upgradeDocument({ transactions: [tx({})] });
    const twice = upgradeDocument(once);
    expect(twice.accounts).toHaveLength(1);
    expect(twice).toEqual(once);
  });

  it("leaves existing accounts and accountIds alone", () => {
    const doc = upgradeDocument({
      accounts: [acct({ id: "wise", name: "Wise" })],
      transactions: [tx({ accountId: "wise" })],
    });
    expect(doc.accounts).toHaveLength(1);
    expect(doc.accounts[0].name).toBe("Wise");
    expect(doc.transactions[0].accountId).toBe("wise");
  });

  it("repoints a transaction whose account no longer exists", () => {
    // Otherwise it would drop out of every balance without a trace.
    const doc = upgradeDocument({
      accounts: [acct({ id: "wise" })],
      transactions: [tx({ accountId: "deleted" })],
    });
    expect(doc.transactions[0].accountId).toBe("wise");
  });

  it("fills in defaults for a completely empty input", () => {
    const doc = upgradeDocument({});
    expect(doc.settings.currency).toBe("EUR");
    expect(doc.categories).toEqual([]);
    expect(doc.accounts).toHaveLength(1);
  });

  it("keeps settings that are already set", () => {
    const doc = upgradeDocument({ settings: { id: "settings", discreetMode: true, activeProfile: "personal", paydays: [28], currency: "GBP" } });
    expect(doc.settings.currency).toBe("GBP");
    expect(doc.settings.discreetMode).toBe(true);
  });
});
