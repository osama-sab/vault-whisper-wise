import { describe, it, expect } from "vitest";
import { describePmVault, exportPmVault, importPmVault } from "@/lib/vault/pmvault";
import { VaultCorruptError, WrongPassphraseError, fromB64, toB64 } from "@/lib/vault/crypto";
import { DEFAULT_ACCOUNT_ID } from "@/lib/budget";
import type { VaultDocument } from "@/lib/vault/types";

const doc = (): VaultDocument => ({
  schema: 2,
  categories: [{ id: "food", name: "Groceries", type: "expenses", profileDefault: "household", monthlyBudget: 400, genericLabel: "Food" }],
  transactions: [{
    id: "t1", date: "2026-04-03", amount: 42.5, categoryId: "food", profile: "household",
    payee: "REWE SAGT DANKE", description: "Einkauf", isVague: false, accountId: DEFAULT_ACCOUNT_ID,
  }],
  subscriptions: [], billPayments: [], rules: [],
  accounts: [{ id: DEFAULT_ACCOUNT_ID, name: "Main", type: "checking", currency: "EUR", openingBalance: 0, openingDate: "2026-01-01" }],
  statements: [],
  settings: { id: "settings", discreetMode: false, activeProfile: "combined", paydays: [1], currency: "EUR" },
});

// Small iteration count: these tests exercise the format, not PBKDF2's cost.
const FAST = 1_000;

describe("pmvault round trip", () => {
  it("exports and restores an identical document", async () => {
    const file = await exportPmVault(doc(), "correct horse", FAST);
    expect(await importPmVault(file, "correct horse")).toEqual(doc());
  });

  it("does not leave the plaintext readable in the file", async () => {
    const file = await exportPmVault(doc(), "pw", FAST);
    expect(file).not.toContain("REWE");
    expect(file).not.toContain("Groceries");
  });

  it("carries a plaintext summary so a file can be described before restoring", async () => {
    const file = await exportPmVault(doc(), "pw", FAST);
    const info = describePmVault(file);
    expect(info).toMatchObject({ transactions: 1, categories: 1, accounts: 1 });
    expect(info!.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("is independent of the on-disk keyring, so it survives a lost profile", async () => {
    // Only the password is needed — nothing from safeStorage or keyring.json.
    const file = await exportPmVault(doc(), "just-the-password", FAST);
    expect(await importPmVault(file, "just-the-password")).toEqual(doc());
  });
});

describe("pmvault rejections", () => {
  it("rejects the wrong password", async () => {
    const file = await exportPmVault(doc(), "right", FAST);
    await expect(importPmVault(file, "wrong")).rejects.toThrow(WrongPassphraseError);
  });

  it("rejects a tampered ciphertext", async () => {
    const file = JSON.parse(await exportPmVault(doc(), "pw", FAST));
    const ct = fromB64(file.ct);
    ct[10] ^= 0x01;
    await expect(importPmVault(JSON.stringify({ ...file, ct: toB64(ct) }), "pw")).rejects.toThrow();
  });

  it("rejects a truncated file", async () => {
    const file = JSON.parse(await exportPmVault(doc(), "pw", FAST));
    const ct = fromB64(file.ct);
    await expect(importPmVault(JSON.stringify({ ...file, ct: toB64(ct.subarray(0, 8)) }), "pw")).rejects.toThrow();
  });

  it("rejects something that is not a backup at all", async () => {
    await expect(importPmVault("{}", "pw")).rejects.toThrow(VaultCorruptError);
    await expect(importPmVault("not json", "pw")).rejects.toThrow(VaultCorruptError);
    expect(describePmVault("not json")).toBeNull();
  });

  it("refuses a format from the future rather than mis-reading it", async () => {
    const file = JSON.parse(await exportPmVault(doc(), "pw", FAST));
    await expect(importPmVault(JSON.stringify({ ...file, format: 2 }), "pw")).rejects.toThrow(/newer version/);
  });
});

describe("pmvault upgrades on restore", () => {
  it("lifts a pre-accounts backup to the current schema", async () => {
    const old = {
      categories: [{ id: "food", name: "Groceries", type: "expenses", profileDefault: "household", monthlyBudget: 400, genericLabel: "Food" }],
      transactions: [{ id: "t1", date: "2026-04-03", amount: 10, categoryId: "food", profile: "household", payee: "", description: "", isVague: false }],
    };
    // Written the same way an old export would have been.
    const file = await exportPmVault(old as unknown as VaultDocument, "pw", FAST);
    const restored = await importPmVault(file, "pw");

    expect(restored.schema).toBe(2);
    expect(restored.accounts).toHaveLength(1);
    expect(restored.transactions[0].accountId).toBe(DEFAULT_ACCOUNT_ID);
    expect(restored.settings.currency).toBe("EUR");
  });

  it("records the iteration count so a backup made at a lower cost still opens", async () => {
    const file = JSON.parse(await exportPmVault(doc(), "pw", 1_000));
    expect(file.iterations).toBe(1_000);
    expect(await importPmVault(JSON.stringify(file), "pw")).toEqual(doc());
  });
});
