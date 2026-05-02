export type ProfileId = "household" | "personal";
export type ProfileFilter = ProfileId | "combined";
export type CategoryType = "income" | "bills" | "expenses" | "savings" | "debt";

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  profileDefault: ProfileId;
  monthlyBudget: number;
  genericLabel: string;
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