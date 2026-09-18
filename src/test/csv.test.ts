import { describe, it, expect } from "vitest";
import { tryParseDate, detectDateOrder, parseAmount, rowHash } from "@/lib/csv";

describe("parseAmount", () => {
  it("reads German formatting", () => {
    expect(parseAmount("-1.234,56")).toBe(-1234.56);
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("-12,50")).toBe(-12.5);
    expect(parseAmount("1.234.567,89")).toBe(1234567.89);
  });

  it("reads English formatting without multiplying by 100", () => {
    // The old parser stripped every dot as a thousands separator, so these
    // came out as 123456 / -4599 / 99 / 1250.
    expect(parseAmount("1234.56")).toBe(1234.56);
    expect(parseAmount("-45.99")).toBe(-45.99);
    expect(parseAmount("0.99")).toBe(0.99);
    expect(parseAmount("12.50")).toBe(12.5);
    expect(parseAmount("1,234.56")).toBe(1234.56);
    expect(parseAmount("1,234,567.89")).toBe(1234567.89);
  });

  it("treats a lone 3-digit group as thousands, not decimals", () => {
    expect(parseAmount("1.234")).toBe(1234);
    expect(parseAmount("1,234")).toBe(1234);
  });

  it("handles currency symbols, trailing signs and parentheses", () => {
    expect(parseAmount("€ 1.234,56")).toBe(1234.56);
    expect(parseAmount("1.234,56 EUR")).toBe(1234.56);
    expect(parseAmount("1234,56-")).toBe(-1234.56);
    expect(parseAmount("(45.99)")).toBe(-45.99);
    expect(parseAmount("")).toBe(0);
    expect(parseAmount(null)).toBe(0);
  });
});

describe("tryParseDate", () => {
  it("parses European dates day-first", () => {
    expect(tryParseDate("03.04.2026", "dmy")).toBe("2026-04-03");
    expect(tryParseDate("31.12.2025", "dmy")).toBe("2025-12-31");
    expect(tryParseDate("03.04.26", "dmy")).toBe("2026-04-03");
    expect(tryParseDate("1.5.2026", "dmy")).toBe("2026-05-01");
  });

  it("parses ISO dates", () => {
    expect(tryParseDate("2026-04-03", "dmy")).toBe("2026-04-03");
    expect(tryParseDate("2026/04/03", "mdy")).toBe("2026-04-03");
  });

  it("parses Wise-style dd-mm-yyyy as day-first", () => {
    // The old code called this path with preferDMY=false and returned
    // 2026-03-04 — 3 April read as 4 March.
    expect(tryParseDate("03-04-2026", "dmy")).toBe("2026-04-03");
    expect(tryParseDate("03/04/2026", "dmy")).toBe("2026-04-03");
  });

  it("lets an out-of-range component override the file order", () => {
    expect(tryParseDate("25.04.2026", "mdy")).toBe("2026-04-25");
    expect(tryParseDate("04/25/2026", "dmy")).toBe("2026-04-25");
  });

  it("parses named months in English and German", () => {
    expect(tryParseDate("3 Oct 2026", "dmy")).toBe("2026-10-03");
    expect(tryParseDate("Oct 3, 2026", "dmy")).toBe("2026-10-03");
    expect(tryParseDate("3. März 2026", "dmy")).toBe("2026-03-03");
    expect(tryParseDate("3 Dezember 2026", "dmy")).toBe("2026-12-03");
  });

  it("strips a time component without shifting the day", () => {
    // Previously this fell through to new Date(...).toISOString(), which in
    // Berlin returned the previous day for times before 02:00.
    expect(tryParseDate("03.04.2026 00:30", "dmy")).toBe("2026-04-03");
    expect(tryParseDate("2026-04-03T00:30:00", "dmy")).toBe("2026-04-03");
  });

  it("rejects impossible and unparseable dates", () => {
    expect(tryParseDate("31.02.2026", "dmy")).toBeNull();
    expect(tryParseDate("29.02.2025", "dmy")).toBeNull(); // 2025 is not a leap year
    expect(tryParseDate("29.02.2024", "dmy")).toBe("2024-02-29");
    expect(tryParseDate("", "dmy")).toBeNull();
    expect(tryParseDate("Saldo", "dmy")).toBeNull();
  });
});

describe("detectDateOrder", () => {
  it("detects day-first from an out-of-range day", () => {
    const r = detectDateOrder(["03.04.2026", "25.04.2026", "01.05.2026"]);
    expect(r).toEqual({ order: "dmy", confident: true });
  });

  it("detects month-first from an out-of-range day in second position", () => {
    const r = detectDateOrder(["04/25/2026", "01/03/2026"]);
    expect(r).toEqual({ order: "mdy", confident: true });
  });

  it("falls back to day-first when every row is ambiguous", () => {
    const r = detectDateOrder(["03.04.2026", "01.02.2026"]);
    expect(r).toEqual({ order: "dmy", confident: false });
  });
});

describe("rowHash", () => {
  it("matches a CSV row against the transaction it was stored as", () => {
    // Stored transactions keep an unsigned amount, so hashing the signed CSV
    // row directly never matched and every re-import duplicated everything.
    const incoming = rowHash({ date: "2026-04-03", amount: -45.99, payee: "REWE SAGT DANKE" });
    const stored = rowHash({ date: "2026-04-03", amount: 45.99, payee: "REWE SAGT DANKE", isCredit: false });
    expect(incoming).toBe(stored);
  });

  it("keeps credits and debits distinct", () => {
    const debit = rowHash({ date: "2026-04-03", amount: -45.99, payee: "AMAZON" });
    const credit = rowHash({ date: "2026-04-03", amount: 45.99, payee: "AMAZON" });
    expect(debit).not.toBe(credit);
  });

  it("is insensitive to payee whitespace and case", () => {
    expect(rowHash({ date: "2026-04-03", amount: -1, payee: "  Rewe   Markt " }))
      .toBe(rowHash({ date: "2026-04-03", amount: -1, payee: "REWE MARKT" }));
  });

  it("avoids floating-point drift", () => {
    expect(rowHash({ date: "2026-04-03", amount: -0.1 - 0.2, payee: "X" }))
      .toBe(rowHash({ date: "2026-04-03", amount: -0.3, payee: "X" }));
  });
});
