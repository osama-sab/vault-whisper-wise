import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Category, Subscription, Transaction } from "@/lib/types";

/** Capture what the exporters hand to the download layer. */
const saved: { name: string; content: string | Blob }[] = [];

vi.mock("@/lib/csv", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/csv")>();
  return {
    ...actual,
    downloadFile: async (name: string, content: string | Blob) => { saved.push({ name, content }); },
  };
});

const { exportReport } = await import("@/lib/pdf");

const cats: Category[] = [
  { id: "sal", name: "Salary", type: "income", profileDefault: "personal", monthlyBudget: 0, genericLabel: "Income" },
  { id: "rent", name: "Rent", type: "bills", profileDefault: "household", monthlyBudget: 800, genericLabel: "Housing" },
  { id: "food", name: "Groceries", type: "expenses", profileDefault: "household", monthlyBudget: 400, genericLabel: "Food" },
  { id: "fun", name: "Entertainment", type: "expenses", profileDefault: "personal", monthlyBudget: 60, genericLabel: "Leisure" },
];

const tx = (o: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  date: "2026-04-10", amount: 20, categoryId: "food", profile: "household",
  payee: "REWE SAGT DANKE", description: "Einkauf", isVague: false, ...o,
});

const subs: Subscription[] = [
  { id: "s1", name: "Netflix", dueDay: 5, expectedAmount: 13, categoryId: "rent", profile: "household", active: true },
];

const transactions: Transaction[] = [
  tx({ date: "2026-04-01", amount: 2400, categoryId: "sal", profile: "personal", payee: "ARBEITGEBER GMBH" }),
  tx({ date: "2026-04-03", amount: 800, categoryId: "rent", payee: "VERMIETER" }),
  tx({ date: "2026-04-05", amount: 62.4 }),
  tx({ date: "2026-04-11", amount: 30, categoryId: "fun", profile: "personal", payee: "NETFLIX.COM", isVague: true, displayDescription: "Leisure" }),
  tx({ date: "2026-05-02", amount: 2400, categoryId: "sal", profile: "personal", payee: "ARBEITGEBER GMBH" }),
  tx({ date: "2026-05-04", amount: 95.2, payee: "LIDL DIENSTLEISTUNG" }),
];

const base = {
  transactions,
  categories: cats,
  subscriptions: subs,
  discreet: false,
  currency: "EUR",
  openingBalances: { household: 500, personal: 250 },
  fileStem: "report",
  periodLabel: "April 2026",
};

beforeEach(() => { saved.length = 0; });

describe("exportReport", () => {
  it("produces a PDF without throwing", async () => {
    await exportReport({
      ...base, profile: "combined", months: [new Date(2026, 3, 1)], formats: ["pdf"],
    });
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe("report.pdf");
    const blob = saved[0].content as Blob;
    expect(blob.size).toBeGreaterThan(1000);
    // A PDF always starts with the %PDF- magic.
    expect(await blob.slice(0, 5).text()).toBe("%PDF-");
  });

  it("renders a yearly report across the months that have data", async () => {
    await exportReport({
      ...base,
      profile: "combined",
      months: Array.from({ length: 12 }, (_, m) => new Date(2026, m, 1)),
      formats: ["pdf"],
      periodLabel: "2026 annual report",
    });
    expect((saved[0].content as Blob).size).toBeGreaterThan(1000);
  });

  it("writes three CSVs including the category summary", async () => {
    await exportReport({
      ...base, profile: "combined", months: [new Date(2026, 3, 1)], formats: ["csv"],
    });
    expect(saved.map((s) => s.name)).toEqual([
      "report-transactions.csv", "report-categories.csv", "report-balances.csv",
    ]);

    const categoriesCsv = saved[1].content as string;
    expect(categoriesCsv).toContain("Over budget by");
    expect(categoriesCsv).toContain("Groceries");

    const balancesCsv = saved[2].content as string;
    // Opening 750 (500 + 250), credits 2400, debits 892.40, 13 still expected
    // for the unmatched Netflix subscription -> closing 2244.60
    expect(balancesCsv).toContain("750");
    expect(balancesCsv).toContain("2244.6");
  });

  it("makes the per-profile closing balances add up to the combined one", async () => {
    // Previously the Household block was handed the combined opening balance
    // and Personal was hardcoded to 0, so neither reconciled with anything.
    await exportReport({
      ...base, profile: "combined", months: [new Date(2026, 3, 1)], formats: ["csv"],
    });
    const [, row] = (saved[2].content as string).trim().split("\n");
    const cols = row.split(",").map(Number);
    const [, , , , , closing, household, personal] = cols;
    expect(household + personal).toBeCloseTo(closing, 6);
  });

  it("honours per-transaction vague in the CSV, not just global discreet mode", async () => {
    await exportReport({
      ...base, profile: "combined", months: [new Date(2026, 3, 1)], formats: ["csv"],
    });
    const txCsv = saved[0].content as string;
    // The vague Netflix row must not leak its payee...
    expect(txCsv).not.toContain("NETFLIX.COM");
    expect(txCsv).toContain("Leisure");
    // ...while ordinary rows still show theirs.
    expect(txCsv).toContain("REWE");
  });

  it("writes an Excel workbook with three sheets", async () => {
    await exportReport({
      ...base, profile: "combined", months: [new Date(2026, 3, 1)], formats: ["xlsx"],
    });
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe("report.xlsx");
    const { unzipSync, strFromU8 } = await import("fflate");
    const files = unzipSync(new Uint8Array(await (saved[0].content as Blob).arrayBuffer()));
    const wb = strFromU8(files["xl/workbook.xml"]);
    expect(wb).toContain('name="Balances"');
    expect(wb).toContain('name="Categories"');
    expect(wb).toContain('name="Transactions"');
  });

  it("can emit every format at once", async () => {
    await exportReport({
      ...base, profile: "household", months: [new Date(2026, 3, 1)], formats: ["pdf", "csv", "xlsx"],
    });
    expect(saved.map((s) => s.name)).toEqual([
      "report.pdf",
      "report-transactions.csv", "report-categories.csv", "report-balances.csv",
      "report.xlsx",
    ]);
  });

  it("carries the closing balance into the next month", async () => {
    await exportReport({
      ...base,
      profile: "combined",
      months: [new Date(2026, 3, 1), new Date(2026, 4, 1)],
      formats: ["csv"],
    });
    const rows = (saved[2].content as string).trim().split("\n");
    expect(rows).toHaveLength(3); // header + April + May
    const april = rows[1].split(",");
    const may = rows[2].split(",");
    // Column order: Month,Opening,Credits,Debits,Still expected,Closing,...
    expect(may[1]).toBe(april[5]);
  });

  it("still renders when the period has no transactions at all", async () => {
    await exportReport({
      ...base, transactions: [], profile: "combined", months: [new Date(2026, 3, 1)], formats: ["pdf"],
    });
    expect((saved[0].content as Blob).size).toBeGreaterThan(500);
  });
});
