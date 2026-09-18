import { create } from "zustand";
import type { Category, Transaction, Subscription, BillPayment, Rule, AppSettings, ProfileFilter } from "./types";
import { Categories, Transactions, Subscriptions, BillPayments, Rules, Settings, seedIfEmpty } from "./db";

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
}));

// Selectors
export function useFilteredTransactions(month?: Date) {
  const { transactions, settings } = useApp();
  return transactions.filter((t) => {
    if (settings.activeProfile !== "combined" && t.profile !== settings.activeProfile) return false;
    if (month) {
      const d = new Date(t.date);
      if (d.getFullYear() !== month.getFullYear() || d.getMonth() !== month.getMonth()) return false;
    }
    return true;
  });
}