import type { Account, AppSettings, Transaction } from "../types";
import { DEFAULT_ACCOUNT_ID } from "../budget";
import { todayISO } from "../format";
import type { VaultDocument } from "./types";

const DEFAULT_SETTINGS: AppSettings = {
  id: "settings", discreetMode: false, activeProfile: "combined", paydays: [1, 15], currency: "EUR",
};

/**
 * Bring any document up to the current schema.
 *
 * Every entry path converges here — the one-time IndexedDB migration, a
 * .pmvault restore, and the legacy JSON backup import — so there is a single
 * place where "old data becomes current data".
 *
 * Idempotent: running it twice must not create a second default account or
 * disturb accountIds that are already set.
 */
export function upgradeDocument(input: Partial<VaultDocument> | Record<string, unknown>): VaultDocument {
  const raw = input as Partial<VaultDocument>;

  const doc: VaultDocument = {
    schema: 2,
    categories: raw.categories ?? [],
    transactions: raw.transactions ?? [],
    subscriptions: raw.subscriptions ?? [],
    billPayments: raw.billPayments ?? [],
    rules: raw.rules ?? [],
    accounts: raw.accounts ?? [],
    statements: raw.statements ?? [],
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
  };

  if (doc.accounts.length === 0) {
    doc.accounts = [defaultAccount(doc.transactions, doc.settings.currency)];
  }

  // Backfill only what is missing, and only onto an account that exists — a
  // transaction pointing at a deleted account would vanish from every balance.
  const known = new Set(doc.accounts.map((a) => a.id));
  const fallback = doc.accounts.find((a) => a.id === DEFAULT_ACCOUNT_ID)?.id ?? doc.accounts[0].id;
  for (const t of doc.transactions) {
    if (!t.accountId || !known.has(t.accountId)) t.accountId = fallback;
  }

  return doc;
}

function defaultAccount(transactions: Transaction[], currency: string): Account {
  // Opens on the earliest transaction, so no history sits before the account
  // exists and gets silently excluded from its balance.
  const earliest = transactions.reduce<string | null>(
    (min, t) => (t.date && (!min || t.date < min) ? t.date : min),
    null
  );
  return {
    id: DEFAULT_ACCOUNT_ID,
    name: "Main",
    type: "checking",
    currency: currency || "EUR",
    openingBalance: 0,
    openingDate: earliest ?? todayISO(),
    sortOrder: 0,
  };
}
