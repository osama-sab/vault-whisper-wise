import { upgradeDocument } from "./upgrade";
import type { VaultDocument } from "./types";

/**
 * Reading an UNENCRYPTED JSON backup.
 *
 * The app only ever writes encrypted files — vault.dat on disk, .pmvault for
 * a backup — and that is not negotiable. Reading is the asymmetric half: a
 * plain JSON export from an older version of this app, from a spreadsheet, or
 * from another tool entirely should be able to get your data in. It is
 * encrypted the moment it lands, because everything in the vault is.
 *
 * Deliberately tolerant about shape and deliberately strict about substance:
 * it accepts several plausible wrappers, but refuses a file that has none of
 * the collections it claims to restore, so a stray .json cannot silently
 * "restore" an empty dataset over real data.
 */

export interface PlainBackup {
  doc: VaultDocument;
  summary: { transactions: number; categories: number; accounts: number; subscriptions: number };
  /** Which wrapper it was found under, for the message shown to the user. */
  shape: "document" | "wrapped" | "bare";
}

/** The collections a restore actually carries. */
const COLLECTIONS = [
  "transactions", "categories", "subscriptions", "billPayments", "rules", "accounts", "statements",
] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Does this object look like it holds any of our collections? */
function collectionsIn(v: Record<string, unknown>): number {
  return COLLECTIONS.filter((k) => Array.isArray(v[k])).length;
}

/**
 * Parse a plain JSON backup, or return null if it is not one.
 *
 * Never throws: a malformed file is a "no", not a crash, because this runs
 * against whatever the user happened to pick in a file dialog.
 */
export function readPlainBackup(text: string): PlainBackup | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  // An encrypted backup is JSON too — refuse it here so the caller's
  // .pmvault path stays the one that handles it (and asks for the password).
  if (typeof parsed.magic === "string" && parsed.magic.startsWith("PMVAULT")) return null;

  let source: Record<string, unknown> | null = null;
  let shape: PlainBackup["shape"] = "document";

  if (collectionsIn(parsed) > 0) {
    source = parsed;
    shape = "schema" in parsed ? "document" : "bare";
  } else {
    // Common wrappers: { data: {...} }, { document: {...} }, { backup: {...} }.
    for (const key of ["data", "document", "doc", "backup", "vault"]) {
      const inner = parsed[key];
      if (isRecord(inner) && collectionsIn(inner) > 0) {
        source = inner;
        shape = "wrapped";
        break;
      }
    }
  }

  if (!source) return null;

  // upgradeDocument fills in defaults, creates the default account and
  // backfills accountIds — the same path a .pmvault restore takes, so a plain
  // import cannot produce a document the rest of the app has never seen.
  const doc = upgradeDocument(source);

  return {
    doc,
    shape,
    summary: {
      transactions: doc.transactions.length,
      categories: doc.categories.length,
      accounts: doc.accounts.length,
      subscriptions: doc.subscriptions.length,
    },
  };
}
