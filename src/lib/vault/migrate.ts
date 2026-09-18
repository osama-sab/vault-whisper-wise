import { openDB } from "idb";
import type { VaultIO } from "./io";
import type { VaultDocument } from "./types";
import { upgradeDocument } from "./upgrade";

/**
 * One-time move from the plaintext IndexedDB to the encrypted vault.
 *
 * The governing rule: a migration failure must never lose data and must never
 * brick the app. The legacy database is deleted ONLY after the vault has been
 * written and read back successfully; on any failure the legacy data is left
 * exactly where it was and the app carries on using it.
 */

const LEGACY_DB = "pocket-budget";
const LEGACY_STORES = ["categories", "transactions", "subscriptions", "billPayments", "rules", "settings"] as const;

export interface LegacyReader {
  probe(): Promise<boolean>;
  readAll(): Promise<Partial<VaultDocument>>;
  destroy(): Promise<{ deleted: boolean }>;
}

export interface MigrationResult {
  status: "no-legacy" | "migrated" | "failed-kept-legacy";
  backupPath?: string;
  counts?: Record<string, number>;
  error?: Error;
  /** The delete was blocked by another connection; retry next launch. */
  legacyDeleteDeferred?: boolean;
}

/** Reads the real IndexedDB written by versions before the vault. */
export function idbLegacyReader(): LegacyReader {
  return {
    async probe() {
      // databases() first: opening by name would CREATE an empty database,
      // and a later run could then mistake it for real (but empty) data.
      if (typeof indexedDB.databases === "function") {
        const list = await indexedDB.databases();
        return list.some((d) => d.name === LEGACY_DB);
      }
      // Fallback for engines without databases(): open with no version, and
      // if the probe itself created the database, remove it again.
      const db = await openDB(LEGACY_DB);
      const created = db.objectStoreNames.length === 0;
      db.close();
      if (created) await deleteLegacyDatabase();
      return !created;
    },

    async readAll() {
      const db = await openDB(LEGACY_DB);
      const out: Record<string, unknown> = {};
      for (const store of LEGACY_STORES) {
        if (!db.objectStoreNames.contains(store)) continue;
        const rows = await db.getAll(store);
        if (store === "settings") out.settings = rows[0];
        else out[store] = rows;
      }
      db.close();
      return out as Partial<VaultDocument>;
    },

    async destroy() {
      return deleteLegacyDatabase();
    },
  };
}

function deleteLegacyDatabase(): Promise<{ deleted: boolean }> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(LEGACY_DB);
    req.onsuccess = () => resolve({ deleted: true });
    req.onerror = () => reject(req.error ?? new Error("Could not delete the old database"));
    // Another tab or window still holds it open. Not a migration failure: the
    // vault is already proven good, so just try again next launch.
    req.onblocked = () => resolve({ deleted: false });
  });
}

function countsOf(doc: VaultDocument): Record<string, number> {
  return {
    categories: doc.categories.length,
    transactions: doc.transactions.length,
    subscriptions: doc.subscriptions.length,
    billPayments: doc.billPayments.length,
    rules: doc.rules.length,
  };
}

/**
 * Migrate, if there is anything to migrate.
 *
 * `writeAndVerify` is supplied by the caller (the Vault), because sealing the
 * document needs the data key — which migration has no business holding.
 */
export async function migrateLegacy(
  io: VaultIO,
  reader: LegacyReader,
  writeAndVerify: (doc: VaultDocument) => Promise<VaultDocument>
): Promise<MigrationResult> {
  let hasLegacy = false;
  try {
    hasLegacy = await reader.probe();
  } catch {
    return { status: "no-legacy" };
  }
  if (!hasLegacy) return { status: "no-legacy" };

  let backupPath: string | undefined;
  try {
    const legacy = await reader.readAll();

    // An empty read must never produce a vault that a later run could mistake
    // for real data. Treat it as "nothing to migrate" and leave it alone.
    const empty = (legacy.categories?.length ?? 0) === 0 && (legacy.transactions?.length ?? 0) === 0;
    if (empty) return { status: "no-legacy" };

    // Plaintext, and therefore uncomfortable — but strictly no worse than the
    // plaintext IndexedDB it is replacing, and it is the difference between a
    // migration bug being an annoyance and it being a lost year of finances.
    // The UI offers to delete it once the user has checked their data.
    backupPath = await io.writeLegacyBackup(JSON.stringify(legacy, null, 2));

    const upgraded = upgradeDocument(legacy);

    // Writes, then reads back from disk through the normal load path.
    const verified = await writeAndVerify(upgraded);
    assertSameContent(upgraded, verified);

    // Only now is it safe to remove the original.
    const { deleted } = await reader.destroy();

    return {
      status: "migrated",
      backupPath,
      counts: countsOf(upgraded),
      legacyDeleteDeferred: !deleted,
    };
  } catch (e) {
    // Leave IndexedDB untouched. The caller drops back to legacy mode.
    return { status: "failed-kept-legacy", backupPath, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/**
 * Compare on counts and id sets rather than a deep equality check.
 *
 * A JSON.stringify comparison would be brittle against key ordering and would
 * fail for reasons that have nothing to do with data integrity.
 */
function assertSameContent(before: VaultDocument, after: VaultDocument): void {
  const a = countsOf(before);
  const b = countsOf(after);
  for (const key of Object.keys(a)) {
    if (a[key] !== b[key]) {
      throw new Error(`Verification failed: ${key} has ${b[key]} records after writing, expected ${a[key]}.`);
    }
  }
  for (const key of ["transactions", "categories"] as const) {
    const ids = (d: VaultDocument) => d[key].map((r) => r.id).sort().join(",");
    if (ids(before) !== ids(after)) {
      throw new Error(`Verification failed: the ${key} written do not match what was read back.`);
    }
  }
}
