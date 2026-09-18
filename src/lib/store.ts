import { create } from "zustand";
import type { Category, Transaction, Subscription, BillPayment, Rule, AppSettings, ProfileFilter } from "./types";
import { Categories, Transactions, Subscriptions, BillPayments, Rules, Settings, seedIfEmpty } from "./db";
import { isInMonth } from "./format";

interface AppState {
  ready: boolean;
  categories: Category[];
  transactions: Transaction[];
  subscriptions: Subscription[];
  billPayments: BillPayment[];
  rules: Rule[];
  settings: AppSettings;
  init: () => Promise<void>;
  reload: () => Promise<void>;
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
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  categories: [],
  transactions: [],
  subscriptions: [],
  billPayments: [],
  rules: [],
  settings: {
    id: "settings",
    discreetMode: false,
    activeProfile: "combined",
    paydays: [1, 15],
    currency: "EUR",
  },
  async init() {
    await seedIfEmpty();
    await get().reload();
    set({ ready: true });
  },
  async reload() {
    const [categories, transactions, subscriptions, billPayments, rules, settings] = await Promise.all([
      Categories.all(),
      Transactions.all(),
      Subscriptions.all(),
      BillPayments.all(),
      Rules.all(),
      Settings.get(),
    ]);
    set({ categories, transactions, subscriptions, billPayments, rules, settings });
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
    ]);
    await get().reload();
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