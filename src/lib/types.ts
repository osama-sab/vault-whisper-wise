export type ProfileId = "household" | "personal";
export type ProfileFilter = ProfileId | "combined";
export type CategoryType = "income" | "bills" | "expenses" | "savings" | "debt";

/** Returns true for category types where money goes OUT */
export function isOutflow(type: CategoryType): boolean {
  return type !== "income";
}

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  profileDefault: ProfileId;
  monthlyBudget: number;
  genericLabel: string;
}

export type AccountType = "checking" | "savings" | "credit" | "cash" | "other";

/** A real-world account: a bank, a card, a wallet. */
export interface Account {
  id: string;
  name: string;              // "Sparkasse", "Wise"
  type: AccountType;
  currency: string;          // ISO 4217; defaults to settings.currency
  openingBalance: number;    // signed: what the account held at openingDate
  openingDate: string;       // ISO yyyy-mm-dd
  profileDefault?: ProfileId;
  archived?: boolean;
  sortOrder?: number;
}

/** The bank's own closing balance for a month, used to reconcile. */
export interface AccountStatement {
  id: string;                // `${accountId}-${year}-${month}` — mirrors BillPayment
  accountId: string;
  year: number;
  month: number;             // 0-11, matching BillPayment
  closingBalance: number;
  enteredAt: string;
}

export interface Transaction {
  id: string;
  date: string; // ISO yyyy-mm-dd
  amount: number; // positive number; sign derived from category type
  categoryId: string;
  profile: ProfileId;
  payee: string;
  description: string;
  displayDescription?: string;
  isVague: boolean;
  splitGroupId?: string;
  importedFrom?: string;
  notes?: string;
  /**
   * Optional on purpose: making it required would break every existing test
   * fixture and every backup exported before accounts existed. Migration
   * backfills it and the UI always sets it; use accountOf() to absorb the gap.
   */
  accountId?: string;
  /** Reserved for transfers between your own accounts (not yet implemented). */
  transferGroupId?: string;
}

export interface Subscription {
  id: string;
  name: string;
  dueDay: number; // 1-31
  expectedAmount: number;
  categoryId: string;
  profile: ProfileId;
  active: boolean;
}

export interface BillPayment {
  id: string; // `${subId}-${year}-${month}`
  subscriptionId: string;
  year: number;
  month: number; // 0-11
  paid: boolean;
  actualAmount?: number;
  /** The transaction created when this bill was marked paid, if any. */
  transactionId?: string;
}

export interface Rule {
  id: string;
  keyword: string;
  field: "payee" | "description" | "either";
  categoryId: string;
  profile: ProfileId;
  priority: number;
}

export interface AppSettings {
  id: "settings";
  discreetMode: boolean;
  activeProfile: ProfileFilter;
  paydays: number[]; // days of month
  currency: string;
}