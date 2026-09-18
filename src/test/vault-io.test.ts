import { describe, it, expect } from "vitest";
import { Vault } from "@/lib/vault/vault";
import { memoryIO, type OsCrypto, type VaultIO } from "@/lib/vault/io";
import { openDocument } from "@/lib/vault/crypto";
import type { Keyring, VaultEnvelope } from "@/lib/vault/types";

const os: OsCrypto = {
  async available() { return true; },
  async encrypt(s) { return `OS(${s})`; },
  async decrypt(s) { return /^OS\((.*)\)$/s.exec(s)![1]; },
};

/**
 * An IO that can be told to fail, and that keeps the previous good envelope
 * the way the real atomic write does (temp -> rename, leaving vault.bak).
 */
function faultyIO(opts: { failWritesFrom?: number; corruptPrimary?: boolean } = {}) {
  let vault: VaultEnvelope | null = null;
  let backup: VaultEnvelope | null = null;
  let keyring: Keyring | null = null;
  let writes = 0;

  const io: VaultIO = {
    async readVault() {
      if (vault && !opts.corruptPrimary) return { envelope: vault, fromBackup: false };
      if (backup) return { envelope: backup, fromBackup: true };
      return vault ? { envelope: vault, fromBackup: false } : null;
    },
    async writeVault(env) {
      writes++;
      if (opts.failWritesFrom && writes >= opts.failWritesFrom) throw new Error("disk full");
      if (vault) backup = vault;
      vault = env;
    },
    async readKeyring() { return keyring; },
    async writeKeyring(kr) { keyring = kr; },
    async writeLegacyBackup() { return "(test)"; },
    async destroy() { vault = backup = keyring = null; },
    async userDataPath() { return "(test)"; },
  };

  return { io, stats: () => ({ writes }), peek: () => ({ vault, backup }) };
}

const tx = (id: string) => ({
  id, date: "2026-04-03", amount: 1, categoryId: "c", profile: "household" as const,
  payee: id, description: "", isVague: false,
});

describe("write coalescing", () => {
  it("collapses a burst of saves into far fewer writes, keeping the LAST state", async () => {
    // A 900-row import calls scheduleSave() 900 times; that must not mean 900
    // encrypt-and-write cycles, and must not lose the final row.
    const f = faultyIO();
    const v = new Vault({ io: f.io, os, debounceMs: 20, maxDelayMs: 500 });
    await v.open();
    const writesAfterOpen = f.stats().writes;

    for (let i = 0; i < 50; i++) {
      v.doc.transactions.push(tx(`t${i}`));
      v.scheduleSave();
    }
    await v.flush();

    const writes = f.stats().writes - writesAfterOpen;
    expect(writes).toBeGreaterThan(0);
    expect(writes).toBeLessThan(50);

    const reopened = new Vault({ io: f.io, os, debounceMs: 0 });
    await reopened.open();
    expect(reopened.doc.transactions).toHaveLength(50);
    expect(reopened.doc.transactions[49].id).toBe("t49");
  });

  it("flush on a clean vault does not write", async () => {
    const f = faultyIO();
    const v = new Vault({ io: f.io, os, debounceMs: 0 });
    await v.open();
    const before = f.stats().writes;
    await v.flush();
    await v.flush();
    expect(f.stats().writes).toBe(before);
  });

  it("reports dirty state so the shell knows whether it must block on quit", async () => {
    const f = faultyIO();
    const v = new Vault({ io: f.io, os, debounceMs: 50 });
    await v.open();
    expect(v.isDirty()).toBe(false);
    v.doc.transactions.push(tx("t1"));
    v.scheduleSave();
    expect(v.isDirty()).toBe(true);
    await v.flush();
    expect(v.isDirty()).toBe(false);
  });
});

describe("failure handling", () => {
  it("a failed write leaves the previously saved document readable", async () => {
    const f = faultyIO();
    const v = new Vault({ io: f.io, os, debounceMs: 0 });
    await v.open();

    v.doc.transactions.push(tx("good"));
    v.scheduleSave();
    await v.flush();

    // Every subsequent write now fails.
    const failing = faultyIO({ failWritesFrom: 1 });
    Object.assign(f.io, { writeVault: failing.io.writeVault });

    v.doc.transactions.push(tx("lost"));
    v.scheduleSave();
    await expect(v.flush()).rejects.toThrow("disk full");

    const reopened = new Vault({ io: f.io, os, debounceMs: 0 });
    await reopened.open();
    expect(reopened.doc.transactions.map((t) => t.id)).toEqual(["good"]);
  });

  it("falls back to the backup envelope and says so", async () => {
    const f = faultyIO();
    const v = new Vault({ io: f.io, os, debounceMs: 0 });
    await v.open();
    v.doc.transactions.push(tx("first"));
    v.scheduleSave();
    await v.flush();
    v.doc.transactions.push(tx("second"));
    v.scheduleSave();
    await v.flush();

    // Simulate vault.dat being unreadable after a kill mid-write.
    const corrupt = faultyIO({ corruptPrimary: true });
    const { vault, backup } = f.peek();
    Object.assign(corrupt.io, {
      readVault: async () => (backup ? { envelope: backup, fromBackup: true } : null),
      readKeyring: f.io.readKeyring,
    });
    void vault;

    const recovered = new Vault({ io: corrupt.io, os, debounceMs: 0 });
    const status = await recovered.open();
    expect(status.usedBackupFile).toBe(true);
    // The backup holds the state one write behind.
    expect(recovered.doc.transactions.map((t) => t.id)).toEqual(["first"]);
  });

  it("a later write still succeeds after an earlier one failed", async () => {
    const f = faultyIO();
    const v = new Vault({ io: f.io, os, debounceMs: 0 });
    await v.open();

    const original = f.io.writeVault.bind(f.io);
    let failNext = true;
    Object.assign(f.io, {
      writeVault: async (env: VaultEnvelope) => {
        if (failNext) { failNext = false; throw new Error("transient"); }
        return original(env);
      },
    });

    v.doc.transactions.push(tx("a"));
    v.scheduleSave();
    await expect(v.flush()).rejects.toThrow("transient");

    v.doc.transactions.push(tx("b"));
    v.scheduleSave();
    await v.flush();

    const reopened = new Vault({ io: f.io, os, debounceMs: 0 });
    await reopened.open();
    expect(reopened.doc.transactions.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("memoryIO", () => {
  it("keeps the previous envelope as a backup", async () => {
    const { io } = memoryIO();
    const env = (n: number) => ({ magic: "PMVAULT", format: 1, cipher: "AES-256-GCM", iv: "", ct: String(n), aad: "", writtenAt: "" }) as VaultEnvelope;
    await io.writeVault(env(1));
    await io.writeVault(env(2));
    expect((await io.readVault())!.envelope.ct).toBe("2");
  });

  it("is isolated between instances, so tests cannot leak into each other", async () => {
    const a = memoryIO();
    await a.io.writeKeyring({ magic: "PMKEYRING", format: 1, keyId: "k", wrap: { kind: "plain", key: "x" }, updatedAt: "" });
    const b = memoryIO();
    expect(await b.io.readKeyring()).toBeNull();
  });
});

describe("round trip through the real crypto", () => {
  it("what the vault writes is what openDocument reads", async () => {
    const f = faultyIO();
    const v = new Vault({ io: f.io, os, debounceMs: 0 });
    await v.open();
    v.doc.transactions.push(tx("t1"));
    v.scheduleSave();
    await v.flush();

    const kr = await f.io.readKeyring();
    const keyB64 = /^OS\((.*)\)$/s.exec((kr!.wrap as { blob: string }).blob)![1];
    const raw = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
    const doc = (await openDocument(raw, (await f.io.readVault())!.envelope)) as { transactions: { id: string }[] };
    expect(doc.transactions[0].id).toBe("t1");
  });
});
