import type { Rule, Transaction, Category, ProfileId } from "./types";

export function applyRules(
  payee: string,
  description: string,
  rules: Rule[]
): { categoryId: string; profile: ProfileId } | null {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  const p = (payee || "").toLowerCase();
  const d = (description || "").toLowerCase();
  for (const r of sorted) {
    const k = r.keyword.toLowerCase();
    const haystack =
      r.field === "payee" ? p : r.field === "description" ? d : `${p} ${d}`;
    if (haystack.includes(k)) return { categoryId: r.categoryId, profile: r.profile };
  }
  return null;
}