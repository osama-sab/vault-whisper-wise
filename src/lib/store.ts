import { create } from "zustand";
import type { Category, Transaction, Subscription, BillPayment, Rule, AppSettings, ProfileFilter, Account, AccountStatement } from "./types";
import {
  Categories, Transactions, Subscriptions, BillPayments, Rules, Settings,
  Accounts, Statements, seedIfEmpty, openVault, unlockVault,
} from "./db";
import { isInMonth } from "./format";
import type { VaultStatus } from "./vault/types";

interface AppState {
  ready: boolean;
  /** Set when the vault needs a passphrase before anything can be loaded. */
  locked: boolean;
  vaultStatus: VaultStatus | null;
  categories: Category[];
  transactions: Transaction[];
  subscriptions: Subscription[];
  billPayments: BillPayment[];
  rules: Rule[];
  accounts: Account[];
  statements: AccountStatement[];
  settings: AppSettings;
  init: () => Promise<void>;
  unlock: (passphrase: string) => Promise<void>;
  reload: () => Promise<void>;
  upsertAccount: (a: Account) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  upsertStatement: (s: AccountStatement) => Promise<void>;
  setActiveProfile: (p: ProfileFilter) => Promise<void>;
  toggleDiscreet: () => Promise<void>;
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
  // CRUD
  upsertCategory: (c: Category) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  upsertTransaction: (t: Transaction) => Promise<void>;
  bulkAddTransactions: (ts: Transaction[]) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  deleteSplitGroup: (groupId: string) => Promise<void>;
  upsertSubscription: (s: Subscription) => Promise<void>;
  deleteSubscription: (id: string) => Promise<void>;
  upsertBillPayment: (b: BillPayment) => Promise<void>;
  upsertRule: (r: Rule) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
  restoreBackup: (data: BackupPayload) => Promise<void>;
}

export interface BackupPayload {
  transactions?: Transaction[];
  categories?: Category[];
  subscriptions?: Subscription[];
  billPayments?: BillPayment[];
  rules?: Rule[];
  accounts?: Account[];
  statements?: AccountStatement[];
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  locked: false,
  vaultStatus: null,
  categories: [],
  transactions: [],
  subscriptions: [],
  billPayments: [],
  rules: [],
  accounts: [],
  statements: [],
  settings: {
    id: "settings",
    discreetMode: false,
    activeProfile: "combined",
    paydays: [1, 15],
    currency: "EUR",
  },
  async init() {
    // Opens the vault first, which also runs the one-time migration from the
    // old plaintext IndexedDB. A vault protected by a passphrase comes back
    // locked, with nothing loaded until unlock() succeeds.
    const status = await openVault();
    if (status.needsPassphrase) {
      set({ locked: true, vaultStatus: status, ready: false });
      return;
    }
    await seedIfEmpty();
    await get().reload();
    set({ ready: true, locked: false, vaultStatus: status });
  },
  async unlock(passphrase) {
    await unlockVault(passphrase);
    set({ locked: false });
    await get().init();
  },
  async reload() {
    const [categories, transactions, subscriptions, billPayments, rules, accounts, statements, settings] = await Promise.all([
      Categories.all(),
      Transactions.all(),
      Subscriptions.all(),
      BillPayments.all(),
      Rules.all(),
      Accounts.all(),
      Statements.all(),
      Settings.get(),
    ]);
    set({ categories, transactions, subscriptions, billPayments, rules, accounts, statements, settings });
  },
  async setActiveProfile(p) {
    const next = { ...get().settings, activeProfile: p };
    await Settings.put(next);
    set({ settings: next });
  },
  async toggleDiscreet() {
    const next = { ...get().settings, discreetMode: !get().settings.discreetMode };
    await Settings.put(next);
    set({ settings: next });
  },
  async saveSettings(patch) {
    const next = { ...get().settings, ...patch };
    await Settings.put(next);
    set({ settings: next });
  },
  async upsertCategory(c) {
    await Categories.put(c);
    set({ categories: await Categories.all() });
  },
  async deleteCategory(id) {
    await Categories.delete(id);
    set({ categories: await Categories.all() });
  },
  async upsertTransaction(t) {
    await Transactions.put(t);
    set({ transactions: await Transactions.all() });
  },
  async bulkAddTransactions(ts) {
    await Transactions.bulkPut(ts);
    set({ transactions: await Transactions.all() });
  },
  async deleteTransaction(id) {
    await Transactions.delete(id);
    set({ transactions: await Transactions.all() });
  },
  async deleteSplitGroup(groupId) {
    await Transactions.deleteSplitGroup(groupId);
    set({ transactions: await Transactions.all() });
  },
  async upsertSubscription(s) {
    await Subscriptions.put(s);
    set({ subscriptions: await Subscriptions.all() });
  },
  async deleteSubscription(id) {
    await Subscriptions.delete(id);
    set({ subscriptions: await Subscriptions.all() });
  },
  async upsertBillPayment(b) {
    await BillPayments.put(b);
    set({ billPayments: await BillPayments.all() });
  },
  async upsertRule(r) {
    await Rules.put(r);
    set({ rules: await Rules.all() });
  },
  async deleteRule(id) {
    await Rules.delete(id);
    set({ rules: await Rules.all() });
  },
  /**
   * Restore a backup in one pass.
   *
   * Previously each record was written with its own upsert, and every upsert
   * re-read the whole object store to refresh state — so restoring n records
   * cost n full table reads and a large backup appeared to hang.
   */
  async restoreBackup(data) {
    await Promise.all([
      Transactions.bulkPut(data.transactions ?? []),
      Categories.bulkPut(data.categories ?? []),
      Subscriptions.bulkPut(data.subscriptions ?? []),
      BillPayments.bulkPut(data.billPayments ?? []),
      Rules.bulkPut(data.rules ?? []),
      Accounts.bulkPut(data.accounts ?? []),
      Statements.bulkPut(data.statements ?? []),
    ]);
    await get().reload();
  },
  async upsertAccount(a) {
    await Accounts.put(a);
    set({ accounts: await Accounts.all() });
  },
  async deleteAccount(id) {
    // Never orphan transactions: an account with any attached to it cannot be
    // removed, or they would silently vanish from every balance.
    const inUse = get().transactions.some((t) => t.accountId === id);
    if (inUse) throw new Error("This account still has transactions. Move or delete them first.");
    await Accounts.delete(id);
    set({ accounts: await Accounts.all() });
  },
  async upsertStatement(s) {
    await Statements.put(s);
    set({ statements: await Statements.all() });
  },
}));

// Selectors
export function useFilteredTransactions(month?: Date) {
  const { transactions, settings } = useApp();
  return transactions.filter((t) => {
    if (settings.activeProfile !== "combined" && t.profile !== settings.activeProfile) return false;
    // Compared as a yyyy-mm prefix: new Date("2026-04-01") parses as UTC
    // midnight and shifts into the previous month west of UTC.
    if (month && !isInMonth(t.date, month)) return false;
    return true;
  });
}