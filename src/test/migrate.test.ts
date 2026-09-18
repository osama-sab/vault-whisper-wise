import { describe, it, expect } from "vitest";
import { Vault } from "@/lib/vault/vault";
import { memoryIO, type OsCrypto, type VaultIO } from "@/lib/vault/io";
import { migrateLegacy, type LegacyReader } from "@/lib/vault/migrate";
import { DEFAULT_ACCOUNT_ID } from "@/lib/budget";
import type { VaultDocument } from "@/lib/vault/types";
import type { Transaction } from "@/lib/types";

const os: OsCrypto = {
  async available() { return true; },
  async encrypt(s) { return `OS(${s})`; },
  async decrypt(s) { return /^OS\((.*)\)$/s.exec(s)![1]; },
};

const tx = (id: string): Transaction => ({
  id, date: "2026-04-10", amount: 20, categoryId: "food", profile: "household",
  payee: "REWE", description: "Einkauf", isVague: false,
});

const legacyData = () => ({
  categories: [{ id: "food", name: "Groceries", type: "expenses" as const, profileDefault: "household" as const, monthlyBudget: 400, genericLabel: "Food" }],
  transactions: [tx("t1"), tx("t2"), tx("t3")],
  subscriptions: [],
  billPayments: [],
  rules: [],
});

/** Fake legacy store, so migration is tested without a real IndexedDB. */
function fakeLegacy(opts: { data?: Partial<VaultDocument>; present?: boolean; deleteBlocked?: boolean } = {}) {
  const state = { present: opts.present ?? true, destroyed: false };
  const reader: LegacyReader = {
    async probe() { return state.present; },
    async readAll() { return opts.data ?? legacyData(); },
    async destroy() {
      if (opts.deleteBlocked) return { deleted: false };
      state.destroyed = true;
      state.present = false;
      return { deleted: true };
    },
  };
  return { reader, state };
}

function backupRecordingIO(): { io: VaultIO; backups: string[] } {
  const { io } = memoryIO();
  const backups: string[] = [];
  return {
    io: { ...io, async writeLegacyBackup(json) { backups.push(json); return `/backups/pre-encryption.json`; } },
    backups,
  };
}

describe("migrateLegacy", () => {
  it("does nothing when there is no legacy database", async () => {
    const { reader } = fakeLegacy({ present: false });
    const { io } = memoryIO();
    const r = await migrateLegacy(io, reader, async (d) => d);
    expect(r.status).toBe("no-legacy");
  });

  it("treats an empty legacy database as nothing to migrate", async () => {
    // An empty read must never produce a vault a later run could mistake for
    // real data.
    const { reader, state } = fakeLegacy({ data: { categories: [], transactions: [] } });
    const { io } = memoryIO();
    const r = await migrateLegacy(io, reader, async (d) => d);
    expect(r.status).toBe("no-legacy");
    expect(state.destroyed).toBe(false);
  });

  it("writes a backup, verifies, then deletes the legacy database", async () => {
    const { reader, state } = fakeLegacy();
    const { io, backups } = backupRecordingIO();
    const r = await migrateLegacy(io, reader, async (d) => d);

    expect(r.status).toBe("migrated");
    expect(r.counts).toMatchObject({ transactions: 3, categories: 1 });
    expect(r.backupPath).toContain("pre-encryption");
    expect(backups).toHaveLength(1);
    expect(JSON.parse(backups[0]).transactions).toHaveLength(3);
    expect(state.destroyed).toBe(true);
  });

  it("writes the backup BEFORE touching anything", async () => {
    const order: string[] = [];
    const { io } = memoryIO();
    const recording: VaultIO = { ...io, async writeLegacyBackup(j) { order.push("backup"); return io.writeLegacyBackup(j); } };
    const { reader } = fakeLegacy();
    await migrateLegacy(recording, reader, async (d) => { order.push("write"); return d; });
    expect(order).toEqual(["backup", "write"]);
  });

  it("upgrades the document on the way through", async () => {
    const { reader } = fakeLegacy();
    const { io } = memoryIO();
    let written: VaultDocument | null = null;
    await migrateLegacy(io, reader, async (d) => { written = d; return d; });
    expect(written!.schema).toBe(2);
    expect(written!.accounts).toHaveLength(1);
    expect(written!.transactions.every((t) => t.accountId === DEFAULT_ACCOUNT_ID)).toBe(true);
  });

  it("KEEPS the legacy database when verification fails", async () => {
    // The single most important behaviour here.
    const { reader, state } = fakeLegacy();
    const { io } = memoryIO();
    const r = await migrateLegacy(io, reader, async (d) => ({ ...d, transactions: d.transactions.slice(1) }));

    expect(r.status).toBe("failed-kept-legacy");
    expect(r.error?.message).toMatch(/Verification failed/);
    expect(state.destroyed).toBe(false);
    expect(state.present).toBe(true);
  });

  it("KEEPS the legacy database when the write itself throws", async () => {
    const { reader, state } = fakeLegacy();
    const { io } = memoryIO();
    const r = await migrateLegacy(io, reader, async () => { throw new Error("disk full"); });
    expect(r.status).toBe("failed-kept-legacy");
    expect(r.error?.message).toBe("disk full");
    expect(state.destroyed).toBe(false);
  });

  it("catches ids being swapped even when the counts match", async () => {
    const { reader, state } = fakeLegacy();
    const { io } = memoryIO();
    const r = await migrateLegacy(io, reader, async (d) => ({
      ...d, transactions: [tx("t1"), tx("t2"), tx("SOMETHING-ELSE")].map((t) => ({ ...t, accountId: DEFAULT_ACCOUNT_ID })),
    }));
    expect(r.status).toBe("failed-kept-legacy");
    expect(state.destroyed).toBe(false);
  });

  it("defers, rather than fails, when the delete is blocked", async () => {
    // The vault is already proven good, so a blocked delete is a retry-later,
    // not a migration failure.
    const { reader } = fakeLegacy({ deleteBlocked: true });
    const { io } = memoryIO();
    const r = await migrateLegacy(io, reader, async (d) => d);
    expect(r.status).toBe("migrated");
    expect(r.legacyDeleteDeferred).toBe(true);
  });
});

describe("Vault.open with a legacy database", () => {
  it("migrates on first open and serves the migrated data", async () => {
    const { io } = memoryIO();
    const { reader, state } = fakeLegacy();
    const v = new Vault({ io, os, debounceMs: 0, legacyReader: reader });
    await v.open();

    expect(v.migration?.status).toBe("migrated");
    expect(v.doc.transactions).toHaveLength(3);
    expect(v.doc.accounts).toHaveLength(1);
    expect(state.destroyed).toBe(true);

    // And it survives a restart.
    const again = new Vault({ io, os, debounceMs: 0, legacyReader: fakeLegacy({ present: false }).reader });
    await again.open();
    expect(again.doc.transactions).toHaveLength(3);
  });

  it("is a no-op on the second open", async () => {
    const { io } = memoryIO();
    const v = new Vault({ io, os, debounceMs: 0, legacyReader: fakeLegacy().reader });
    await v.open();

    const second = new Vault({ io, os, debounceMs: 0, legacyReader: fakeLegacy().reader });
    await second.open();
    // A keyring already exists, so migration must not run again and must not
    // re-import the legacy rows on top of the vault.
    expect(second.migration).toBeNull();
    expect(second.doc.transactions).toHaveLength(3);
  });

  it("falls back to legacy mode instead of bricking when migration fails", async () => {
    const { io } = memoryIO();
    const failing: VaultIO = { ...io, async writeLegacyBackup() { throw new Error("cannot write backup"); } };
    const { reader, state } = fakeLegacy();

    const v = new Vault({ io: failing, os, debounceMs: 0, legacyReader: reader });
    const status = await v.open();

    expect(status.mode).toBe("legacy-fallback");
    expect(v.migration?.status).toBe("failed-kept-legacy");
    expect(state.destroyed).toBe(false);
    // The app still opens.
    expect(v.doc).toBeDefined();
  });

  it("starts clean when there is no legacy data at all", async () => {
    const { io } = memoryIO();
    const v = new Vault({ io, os, debounceMs: 0, legacyReader: fakeLegacy({ present: false }).reader });
    const status = await v.open();
    expect(status.mode).toBe("vault");
    expect(v.migration?.status).toBe("no-legacy");
    expect(v.doc.transactions).toEqual([]);
  });
});
