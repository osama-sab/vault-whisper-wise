import type {
  Account, AccountStatement, AppSettings, BillPayment, Category, Rule, Subscription, Transaction,
} from "./types";
import { getVault } from "./vault/vault";
import type { VaultDocument, VaultStatus } from "./vault/types";

/**
 * The data layer, backed by the encrypted vault.
 *
 * Every exported name and signature is unchanged from the IndexedDB version,
 * so store.ts and the pages that import these facades did not have to move.
 * The facades stay async even though the data is already in memory, because
 * that is the contract every call site was written against.
 *
 * The legacy IndexedDB code now lives in vault/migrate.ts, which reads it once
 * and then deletes it.
 */

const doc = (): VaultDocument => getVault().doc;
const touch = () => getVault().scheduleSave();

export const uid = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
};

// ---- Generic helpers ----

type Collection = "categories" | "transactions" | "subscriptions" | "billPayments" | "rules" | "accounts" | "statements";

/**
 * Returns a COPY, never the live array.
 *
 * store.ts does `set({ transactions: await Transactions.all() })`. Handing back
 * the live array would keep the same reference, zustand would treat the update
 * as a no-op, and every list in the UI would silently stop re-rendering.
 */
function all<T>(key: Collection): Promise<T[]> {
  return Promise.resolve([...(doc()[key] as unknown as T[])]);
}

function put<T extends { id: string }>(key: Collection, value: T): Promise<T> {
  const arr = doc()[key] as unknown as T[];
  const i = arr.findIndex((x) => x.id === value.id);
  if (i >= 0) arr[i] = value;
  else arr.push(value);
  touch();
  return Promise.resolve(value);
}

function bulk<T extends { id: string }>(key: Collection, items: T[]): Promise<void> {
  if (items.length) {
    const arr = doc()[key] as unknown as T[];
    const index = new Map(arr.map((x, i) => [x.id, i]));
    for (const item of items) {
      const i = index.get(item.id);
      if (i === undefined) { index.set(item.id, arr.length); arr.push(item); }
      else arr[i] = item;
    }
    touch();
  }
  return Promise.resolve();
}

function del(key: Collection, id: string): Promise<void> {
  const arr = doc()[key] as unknown as { id: string }[];
  const i = arr.findIndex((x) => x.id === id);
  if (i >= 0) { arr.splice(i, 1); touch(); }
  return Promise.resolve();
}

// ---- Categories ----
export const Categories = {
  all: () => all<Category>("categories"),
  put: (c: Category) => put("categories", c),
  bulkPut: (items: Category[]) => bulk("categories", items),
  delete: (id: string) => del("categories", id),
};

// ---- Transactions ----
export const Transactions = {
  all: () => all<Transaction>("transactions"),
  put: (t: Transaction) => put("transactions", t),
  bulkPut: (items: Transaction[]) => bulk("transactions", items),
  delete: (id: string) => del("transactions", id),
  deleteSplitGroup: async (groupId: string) => {
    const arr = doc().transactions;
    const remaining = arr.filter((t) => t.splitGroupId !== groupId);
    if (remaining.length !== arr.length) {
      arr.length = 0;
      arr.push(...remaining);
      touch();
    }
  },
};

export const Subscriptions = {
  all: () => all<Subscription>("subscriptions"),
  put: (s: Subscription) => put("subscriptions", s),
  bulkPut: (items: Subscription[]) => bulk("subscriptions", items),
  delete: (id: string) => del("subscriptions", id),
};

export const BillPayments = {
  all: () => all<BillPayment>("billPayments"),
  put: (b: BillPayment) => put("billPayments", b),
  bulkPut: (items: BillPayment[]) => bulk("billPayments", items),
  delete: (id: string) => del("billPayments", id),
};

export const Rules = {
  all: () => all<Rule>("rules"),
  put: (r: Rule) => put("rules", r),
  bulkPut: (items: Rule[]) => bulk("rules", items),
  delete: (id: string) => del("rules", id),
};

export const Accounts = {
  all: () => all<Account>("accounts"),
  put: (a: Account) => put("accounts", a),
  bulkPut: (items: Account[]) => bulk("accounts", items),
  delete: (id: string) => del("accounts", id),
};

export const Statements = {
  all: () => all<AccountStatement>("statements"),
  put: (s: AccountStatement) => put("statements", s),
  bulkPut: (items: AccountStatement[]) => bulk("statements", items),
  delete: (id: string) => del("statements", id),
};

export const Settings = {
  get: async (): Promise<AppSettings> => ({ ...doc().settings }),
  put: async (s: AppSettings) => {
    doc().settings = s;
    touch();
    return s;
  },
};

// ---- Lifecycle ----

/** Opens the vault, running the one-time migration if this is the first time. */
export async function openVault(): Promise<VaultStatus> {
  return getVault().open();
}

export async function unlockVault(passphrase: string): Promise<void> {
  await getVault().unlock(passphrase);
}

/** Write anything pending right now — before an export or an erase. */
export async function flushVault(): Promise<void> {
  await getVault().flush();
}

/**
 * Erase everything.
 *
 * Also removes the legacy IndexedDB, which may still exist if a migration
 * delete was deferred because another window held it open.
 */
export async function deleteDatabase(): Promise<void> {
  await getVault().destroy();
  await new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase("pocket-budget");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ---- Seeding ----
export async function seedIfEmpty() {
  const cats = await Categories.all();
  if (cats.length > 0) return;

  const seed: Category[] = [
    // Income
    { id: uid(), name: "Salary", type: "income", profileDefault: "personal", monthlyBudget: 0, genericLabel: "Income" },
    { id: uid(), name: "Side Income", type: "income", profileDefault: "personal", monthlyBudget: 0, genericLabel: "Income" },
    { id: uid(), name: "Other Income", type: "income", profileDefault: "household", monthlyBudget: 0, genericLabel: "Income" },
    // Bills
    { id: uid(), name: "Rent", type: "bills", profileDefault: "household", monthlyBudget: 800, genericLabel: "Housing" },
    { id: uid(), name: "Utilities", type: "bills", profileDefault: "household", monthlyBudget: 150, genericLabel: "Utilities" },
    { id: uid(), name: "Internet", type: "bills", profileDefault: "household", monthlyBudget: 40, genericLabel: "Utilities" },
    { id: uid(), name: "Phone", type: "bills", profileDefault: "personal", monthlyBudget: 25, genericLabel: "Utilities" },
    { id: uid(), name: "Insurance", type: "bills", profileDefault: "personal", monthlyBudget: 80, genericLabel: "Insurance" },
    // Expenses
    { id: uid(), name: "Groceries", type: "expenses", profileDefault: "household", monthlyBudget: 400, genericLabel: "Food" },
    { id: uid(), name: "Dining", type: "expenses", profileDefault: "personal", monthlyBudget: 100, genericLabel: "Food" },
    { id: uid(), name: "Transport", type: "expenses", profileDefault: "personal", monthlyBudget: 80, genericLabel: "Transport" },
    { id: uid(), name: "Medical", type: "expenses", profileDefault: "personal", monthlyBudget: 50, genericLabel: "Medical" },
    { id: uid(), name: "Personal", type: "expenses", profileDefault: "personal", monthlyBudget: 100, genericLabel: "Personal" },
    { id: uid(), name: "Household", type: "expenses", profileDefault: "household", monthlyBudget: 80, genericLabel: "Household" },
    { id: uid(), name: "Entertainment", type: "expenses", profileDefault: "personal", monthlyBudget: 60, genericLabel: "Leisure" },
    // Savings
    { id: uid(), name: "Emergency Fund", type: "savings", profileDefault: "household", monthlyBudget: 200, genericLabel: "Savings" },
    { id: uid(), name: "Goals", type: "savings", profileDefault: "personal", monthlyBudget: 100, genericLabel: "Savings" },
    // Debt
    { id: uid(), name: "Loan", type: "debt", profileDefault: "household", monthlyBudget: 0, genericLabel: "Debt" },
    { id: uid(), name: "Credit Card", type: "debt", profileDefault: "personal", monthlyBudget: 0, genericLabel: "Debt" },
  ];

  await Categories.bulkPut(seed);
}
