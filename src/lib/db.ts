import { openDB, IDBPDatabase } from "idb";
import type { Category, Transaction, Subscription, BillPayment, Rule, AppSettings } from "./types";

const DB_NAME = "pocket-budget";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      // Every creation is guarded. The previous version called
      // createObjectStore() unconditionally, which works at version 1 and
      // throws ConstraintError on every existing install the moment
      // DB_VERSION is raised — i.e. during the first schema change.
      upgrade(db) {
        if (!db.objectStoreNames.contains("categories")) {
          db.createObjectStore("categories", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("transactions")) {
          const tx = db.createObjectStore("transactions", { keyPath: "id" });
          tx.createIndex("by-date", "date");
          tx.createIndex("by-category", "categoryId");
          tx.createIndex("by-profile", "profile");
        }
        for (const name of ["subscriptions", "billPayments", "rules", "settings"]) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Close the cached connection and delete the database, waiting for the result.
 *
 * "Erase all local data" previously fired deleteDatabase() without closing the
 * open connection and without awaiting it, then reloaded — so the delete was
 * blocked by the live connection and usually did nothing at all.
 */
export async function deleteDatabase(): Promise<void> {
  if (dbPromise) {
    try { (await dbPromise).close(); } catch { /* already closed */ }
    dbPromise = null;
  }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("Could not delete the database"));
    // Fires when another tab still holds the database open.
    req.onblocked = () => resolve();
  });
}

export const uid = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
};

// ---- Generic helpers ----
async function all<T>(store: string): Promise<T[]> {
  const db = await getDB();
  return (await db.getAll(store)) as T[];
}
async function put<T>(store: string, value: T) {
  const db = await getDB();
  await db.put(store, value);
  return value;
}
async function del(store: string, key: string) {
  const db = await getDB();
  await db.delete(store, key);
}
/** Write many records in one transaction. */
async function bulk<T>(store: string, items: T[]) {
  if (!items.length) return;
  const db = await getDB();
  const tx = db.transaction(store, "readwrite");
  await Promise.all(items.map((i) => tx.store.put(i)));
  await tx.done;
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
    const db = await getDB();
    const all = (await db.getAll("transactions")) as Transaction[];
    const tx = db.transaction("transactions", "readwrite");
    await Promise.all(
      all.filter((t) => t.splitGroupId === groupId).map((t) => tx.store.delete(t.id))
    );
    await tx.done;
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

export const Settings = {
  get: async (): Promise<AppSettings> => {
    const db = await getDB();
    const s = (await db.get("settings", "settings")) as AppSettings | undefined;
    return (
      s || {
        id: "settings",
        discreetMode: false,
        activeProfile: "combined",
        paydays: [1, 15],
        currency: "EUR",
      }
    );
  },
  put: (s: AppSettings) => put("settings", s),
};

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
  const db = await getDB();
  const tx = db.transaction("categories", "readwrite");
  await Promise.all(seed.map((c) => tx.store.put(c)));
  await tx.done;
}