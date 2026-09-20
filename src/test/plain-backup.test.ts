import { describe, it, expect } from "vitest";
import { readPlainBackup } from "@/lib/vault/plain";

const tx = {
  id: "t1", date: "2026-03-04", amount: 12.5, categoryId: "c1", profile: "personal",
  payee: "REWE", description: "", isVague: false,
};
const cat = {
  id: "c1", name: "Groceries", type: "expenses", profileDefault: "personal",
  monthlyBudget: 300, genericLabel: "Food",
};

describe("readPlainBackup", () => {
  it("reads a full document export", () => {
    const b = readPlainBackup(JSON.stringify({ schema: 2, transactions: [tx], categories: [cat] }));
    expect(b?.shape).toBe("document");
    expect(b?.summary.transactions).toBe(1);
    expect(b?.doc.categories[0].name).toBe("Groceries");
  });

  it("reads a bare collection dump with no schema field", () => {
    const b = readPlainBackup(JSON.stringify({ transactions: [tx], categories: [cat] }));
    expect(b?.shape).toBe("bare");
    expect(b?.summary.transactions).toBe(1);
  });

  it("unwraps a { data: ... } wrapper", () => {
    const b = readPlainBackup(JSON.stringify({ exportedBy: "something", data: { transactions: [tx] } }));
    expect(b?.shape).toBe("wrapped");
    expect(b?.summary.transactions).toBe(1);
  });

  it("upgrades what it reads: a default account exists and is backfilled", () => {
    const b = readPlainBackup(JSON.stringify({ transactions: [tx], categories: [cat] }));
    expect(b?.doc.accounts.length).toBe(1);
    expect(b?.doc.transactions[0].accountId).toBe(b?.doc.accounts[0].id);
    // The account opens no later than the earliest transaction, or the
    // history would sit outside every balance.
    expect(b?.doc.accounts[0].openingDate).toBe("2026-03-04");
  });

  it("refuses an encrypted backup, so the password path keeps handling it", () => {
    expect(readPlainBackup(JSON.stringify({ magic: "PMVAULT-EXPORT", ct: "…" }))).toBeNull();
  });

  it("refuses JSON that carries none of our collections", () => {
    expect(readPlainBackup(JSON.stringify({ hello: "world" }))).toBeNull();
    expect(readPlainBackup(JSON.stringify({ data: { unrelated: [1, 2] } }))).toBeNull();
  });

  it("refuses non-JSON and non-objects rather than throwing", () => {
    expect(readPlainBackup("not json at all")).toBeNull();
    expect(readPlainBackup("[]")).toBeNull();
    expect(readPlainBackup("")).toBeNull();
  });
});
