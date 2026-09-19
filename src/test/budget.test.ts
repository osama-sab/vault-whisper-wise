import { describe, it, expect } from "vitest";
import { reconcileMonth, buildLedger, transactionsForMonth } from "@/lib/budget";
import type { Category, Subscription, Transaction } from "@/lib/types";

const cats: Category[] = [
  { id: "sal", name: "Salary", type: "income", profileDefault: "personal", monthlyBudget: 0, genericLabel: "Income" },
  { id: "bill", name: "Internet", type: "bills", profileDefault: "household", monthlyBudget: 40, genericLabel: "Utilities" },
  { id: "food", name: "Groceries", type: "expenses", profileDefault: "household", monthlyBudget: 400, genericLabel: "Food" },
];

const tx = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  date: "2026-04-10",
  amount: 10,
  categoryId: "food",
  profile: "household",
  payee: "",
  description: "",
  isVague: false,
  ...over,
});

const sub = (over: Partial<Subscription>): Subscription => ({
  id: Math.random().toString(36).slice(2),
  name: "Internet",
  dueDay: 5,
  expectedAmount: 40,
  categoryId: "bill",
  profile: "household",
  active: true,
  ...over,
});

describe("reconcileMonth", () => {
  it("sums credits and debits from real transactions", () => {
    const r = reconcileMonth(
      [tx({ amount: 2000, categoryId: "sal", profile: "personal" }), tx({ amount: 55 })],
      cats,
      []
    );
    expect(r.credit).toBe(2000);
    expect(r.debit).toBe(55);
    expect(r.net).toBe(1945);
  });

  it("does NOT double-count a subscription already present as a transaction", () => {
    // The old code added the 40 to debit via the transaction AND subtracted it
    // again as a committed subscription, making the month look 40 worse.
    const s = sub({});
    const r = reconcileMonth([tx({ amount: 40, categoryId: "bill" })], cats, [s]);
    expect(r.debit).toBe(40);
    expect(r.stillExpected).toBe(0);
    expect(r.fulfilled).toHaveLength(1);
    expect(r.net).toBe(-40);
  });

  it("still owes a subscription with no matching transaction", () => {
    const r = reconcileMonth([], cats, [sub({})]);
    expect(r.debit).toBe(0);
    expect(r.stillExpected).toBe(40);
    expect(r.outstanding).toHaveLength(1);
    expect(r.net).toBe(-40);
  });

  it("tolerates a bill that varies month to month", () => {
    const r = reconcileMonth([tx({ amount: 47, categoryId: "bill" })], cats, [sub({})]);
    expect(r.stillExpected).toBe(0);
  });

  it("does not let one transaction settle two subscriptions", () => {
    const r = reconcileMonth([tx({ amount: 40, categoryId: "bill" })], cats, [sub({}), sub({})]);
    expect(r.fulfilled).toHaveLength(1);
    expect(r.stillExpected).toBe(40);
  });

  it("ignores inactive subscriptions", () => {
    const r = reconcileMonth([], cats, [sub({ active: false })]);
    expect(r.stillExpected).toBe(0);
  });

  it("does not match a subscription across profiles", () => {
    const r = reconcileMonth([tx({ amount: 40, categoryId: "bill", profile: "personal" })], cats, [sub({})]);
    expect(r.stillExpected).toBe(40);
  });

  it("splits totals by category", () => {
    const r = reconcileMonth([tx({ amount: 30 }), tx({ amount: 20 })], cats, []);
    expect(r.byCategory.get("food")).toEqual({ credit: 0, debit: 50 });
  });
});

describe("transactionsForMonth", () => {
  it("selects by calendar month without a timezone round-trip", () => {
    const all = [tx({ date: "2026-03-31" }), tx({ date: "2026-04-01" }), tx({ date: "2026-04-30" }), tx({ date: "2026-05-01" })];
    const got = transactionsForMonth(all, new Date(2026, 3, 15)).map((t) => t.date);
    expect(got).toEqual(["2026-04-01", "2026-04-30"]);
  });
});

describe("buildLedger", () => {
  it("carries each closing balance into the next opening balance", () => {
    const months = [new Date(2026, 3, 1), new Date(2026, 4, 1)];
    const all = [
      tx({ date: "2026-04-10", amount: 1000, categoryId: "sal", profile: "personal" }),
      tx({ date: "2026-04-12", amount: 200 }),
      tx({ date: "2026-05-10", amount: 300 }),
    ];
    const rows = buildLedger(months, all, cats, [], 500);

    expect(rows[0].opening).toBe(500);
    expect(rows[0].closing).toBe(1300); // 500 + 1000 − 200
    expect(rows[1].opening).toBe(1300);
    expect(rows[1].closing).toBe(1000); // 1300 − 300
  });
});

describe("reconcileMonth with explicit bill payments", () => {
  const gym = sub({ id: "gym", name: "Gym", expectedAmount: 30, categoryId: "bill" });
  const mag = sub({ id: "mag", name: "Magazine", expectedAmount: 32, categoryId: "bill" });

  it("an explicit link beats the amount heuristic", () => {
    // Both subscriptions are within tolerance of the one transaction, so
    // without a link the heuristic would hand it to whichever came first.
    const t = tx({ id: "paid-mag", amount: 32, categoryId: "bill" });
    const r = reconcileMonth([t], cats, [gym, mag], [
      { id: "mag-2026-3", subscriptionId: "mag", year: 2026, month: 3, paid: true, transactionId: "paid-mag" },
    ]);
    expect(r.fulfilled.map((s) => s.id)).toContain("mag");
    expect(r.outstanding.map((s) => s.id)).toEqual(["gym"]);
    expect(r.stillExpected).toBe(30);
  });

  it("a linked transaction cannot also settle a different subscription", () => {
    const t = tx({ id: "paid-mag", amount: 32, categoryId: "bill" });
    const r = reconcileMonth([t], cats, [mag, gym], [
      { id: "mag-2026-3", subscriptionId: "mag", year: 2026, month: 3, paid: true, transactionId: "paid-mag" },
    ]);
    expect(r.fulfilled.map((s) => s.id)).toEqual(["mag"]);
    expect(r.outstanding.map((s) => s.id)).toEqual(["gym"]);
  });

  it("ignores a payment marked unpaid", () => {
    const r = reconcileMonth([], cats, [gym], [
      { id: "gym-2026-3", subscriptionId: "gym", year: 2026, month: 3, paid: false },
    ]);
    expect(r.outstanding).toHaveLength(1);
    expect(r.stillExpected).toBe(30);
  });

  it("behaves exactly as before when no payments are passed", () => {
    const r = reconcileMonth([tx({ amount: 30, categoryId: "bill" })], cats, [gym]);
    expect(r.fulfilled).toHaveLength(1);
    expect(r.stillExpected).toBe(0);
  });
});
