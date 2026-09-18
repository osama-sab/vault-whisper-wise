import { describe, it, expect, beforeEach } from "vitest";
import { Vault, emptyDocument } from "@/lib/vault/vault";
import { memoryIO, type OsCrypto, type VaultIO } from "@/lib/vault/io";
import { WrongPassphraseError } from "@/lib/vault/crypto";

/** Stands in for Electron's safeStorage. Reversible and obviously not real. */
function fakeOs(available = true): OsCrypto {
  return {
    async available() { return available; },
    async encrypt(s) { return `OS(${s})`; },
    async decrypt(s) {
      const m = /^OS\((.*)\)$/s.exec(s);
      if (!m) throw new Error("not an OS blob");
      return m[1];
    },
  };
}

let io: VaultIO;
beforeEach(() => { io = memoryIO().io; });

describe("Vault.open", () => {
  it("creates a keyring and an empty document on first run", async () => {
    const v = new Vault({ io, os: fakeOs(), debounceMs: 0 });
    const status = await v.open();
    expect(status.wrap).toBe("os");
    expect(status.encryptedAtRest).toBe(true);
    expect(status.needsPassphrase).toBe(false);
    expect(v.doc.transactions).toEqual([]);
    expect(await io.readKeyring()).not.toBeNull();
  });

  it("reopens an existing vault with its data intact", async () => {
    const a = new Vault({ io, os: fakeOs(), debounceMs: 0 });
    await a.open();
    a.doc.transactions.push({
      id: "t1", date: "2026-04-03", amount: 42.5, categoryId: "c", profile: "household",
      payee: "REWE", description: "Einkauf", isVague: false,
    });
    a.scheduleSave();
    await a.flush();

    const b = new Vault({ io, os: fakeOs(), debounceMs: 0 });
    await b.open();
    expect(b.doc.transactions).toHaveLength(1);
    expect(b.doc.transactions[0].payee).toBe("REWE");
  });

  it("never writes the plaintext to the backing store", async () => {
    const v = new Vault({ io, os: fakeOs(), debounceMs: 0 });
    await v.open();
    v.doc.transactions.push({
      id: "t1", date: "2026-04-03", amount: 42.5, categoryId: "c", profile: "household",
      payee: "VERY-SECRET-PAYEE", description: "", isVague: false,
    });
    v.scheduleSave();
    await v.flush();
    const raw = JSON.stringify(await io.readVault());
    expect(raw).not.toContain("VERY-SECRET-PAYEE");
  });
});

describe("no OS keystore", () => {
  it("falls back to a plain wrap and reports that it is NOT encrypted", async () => {
    const v = new Vault({ io, os: fakeOs(false), debounceMs: 0 });
    const status = await v.open();
    expect(status.wrap).toBe("plain");
    expect(status.encryptedAtRest).toBe(false);
    expect(status.osEncryptionAvailable).toBe(false);
  });

  it("still works, so the app is never bricked by a missing keyring", async () => {
    const v = new Vault({ io, os: fakeOs(false), debounceMs: 0 });
    await v.open();
    v.doc.rules.push({ id: "r", keyword: "REWE", field: "either", categoryId: "c", profile: "household", priority: 10 });
    v.scheduleSave();
    await v.flush();

    const again = new Vault({ io, os: fakeOs(false), debounceMs: 0 });
    await again.open();
    expect(again.doc.rules).toHaveLength(1);
  });

  it("a passphrase gives real encryption even with no OS keystore", async () => {
    const v = new Vault({ io, os: fakeOs(false), debounceMs: 0 });
    await v.open();
    const status = await v.setPassphrase("hunter2");
    expect(status.wrap).toBe("passphrase");
    expect(status.encryptedAtRest).toBe(true);
  });
});

describe("passphrase", () => {
  it("enabling one leaves vault.dat byte-identical", async () => {
    // The load-bearing assertion for the whole key-wrapping design: turning a
    // passphrase on re-wraps the ~600-byte keyring and must NOT re-encrypt the
    // megabyte of data beside it.
    const v = new Vault({ io, os: fakeOs(), debounceMs: 0 });
    await v.open();
    v.doc.transactions.push({
      id: "t1", date: "2026-04-03", amount: 1, categoryId: "c", profile: "household",
      payee: "X", description: "", isVague: false,
    });
    v.scheduleSave();
    await v.flush();

    const before = JSON.stringify((await io.readVault())!.envelope);
    await v.setPassphrase("hunter2");
    const after = JSON.stringify((await io.readVault())!.envelope);

    expect(after).toBe(before);
    expect((await io.readKeyring())!.wrap.kind).toBe("os+passphrase");
  });

  it("locks the vault on the next open and unlocks with the right passphrase", async () => {
    const a = new Vault({ io, os: fakeOs(), debounceMs: 0 });
    await a.open();
    a.doc.categories.push({ id: "c1", name: "Groceries", type: "expenses", profileDefault: "household", monthlyBudget: 400, genericLabel: "Food" });
    a.scheduleSave();
    await a.flush();
    await a.setPassphrase("hunter2");

    const b = new Vault({ io, os: fakeOs(), debounceMs: 0 });
    const status = await b.open();
    expect(status.needsPassphrase).toBe(true);
    expect(() => b.doc).toThrow();

    await b.unlock("hunter2");
    expect(b.doc.categories).toHaveLength(1);
  });

  it("rejects the wrong passphrase", async () => {
    const a = new Vault({ io, os: fakeOs(), debounceMs: 0 });
    await a.open();
    await a.setPassphrase("hunter2");

    const b = new Vault({ io, os: fakeOs(), debounceMs: 0 });
    await b.open();
    await expect(b.unlock("nope")).rejects.toThrow(WrongPassphraseError);
  });

  it("requires BOTH the OS key and the passphrase, not either", async () => {
    // If the two wraps were independent, anyone with the Windows account could
    // decrypt without the passphrase and the feature would be decorative.
    const a = new Vault({ io, os: fakeOs(), debounceMs: 0 });
    await a.open();
    await a.setPassphrase("hunter2");

    // A working OS keystore alone must not be enough.
    const b = new Vault({ io, os: fakeOs(), debounceMs: 0 });
    const status = await b.open();
    expect(status.needsPassphrase).toBe(true);

    // And the passphrase alone must not be enough if the OS key is gone.
    const brokenOs: OsCrypto = { ...fakeOs(), async decrypt() { throw new Error("DPAPI unavailable"); } };
    const c = new Vault({ io, os: brokenOs, debounceMs: 0 });
    await c.open();
    await expect(c.unlock("hunter2")).rejects.toThrow();
  });

  it("changes and removes the passphrase", async () => {
    const v = new Vault({ io, os: fakeOs(), debounceMs: 0 });
    await v.open();
    await v.setPassphrase("first");
    await v.setPassphrase("second", "first");

    const changed = new Vault({ io, os: fakeOs(), debounceMs: 0 });
    await changed.open();
    await expect(changed.unlock("first")).rejects.toThrow(WrongPassphraseError);
    await changed.unlock("second");

    const status = await changed.setPassphrase(null, "second");
    expect(status.wrap).toBe("os");

    const open = new Vault({ io, os: fakeOs(), debounceMs: 0 });
    expect((await open.open()).needsPassphrase).toBe(false);
  });
});

describe("destroy", () => {
  it("removes the vault and the keyring", async () => {
    const v = new Vault({ io, os: fakeOs(), debounceMs: 0 });
    await v.open();
    v.scheduleSave();
    await v.flush();
    await v.destroy();
    expect(await io.readVault()).toBeNull();
    expect(await io.readKeyring()).toBeNull();
  });
});

describe("emptyDocument", () => {
  it("is schema 2 with every collection present", async () => {
    const d = emptyDocument();
    expect(d.schema).toBe(2);
    for (const k of ["categories", "transactions", "subscriptions", "billPayments", "rules", "accounts", "statements"] as const) {
      expect(Array.isArray(d[k])).toBe(true);
    }
    expect(d.settings.currency).toBe("EUR");
  });
});

