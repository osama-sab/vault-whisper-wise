import type { ProfileFilter } from "./types";

/**
 * Money formatting. Never throws: an incomplete or invalid ISO currency code
 * (e.g. while the user is mid-keystroke in Settings) would otherwise make
 * Intl.NumberFormat throw RangeError during render and blank the whole app.
 */
export function formatMoney(n: number, currency = "EUR") {
  const amount = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${(currency || "").trim()}`.trim();
  }
}

/**
 * Just the symbol for a currency ("€", "$", "kr").
 *
 * For adorning an input where a full formatted amount would be wrong but a
 * bare number is ambiguous. Falls back to the code itself, which is always
 * meaningful even when a symbol is not available.
 */
export function currencySymbol(currency = "EUR"): string {
  try {
    const parts = new Intl.NumberFormat(undefined, { style: "currency", currency })
      .formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return (currency || "").trim();
  }
}

/** True for a well-formed ISO 4217 code, which is all Intl will accept. */
export function isValidCurrency(code: string): boolean {
  if (!/^[A-Za-z]{3}$/.test(code || "")) return false;
  try {
    new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(1);
    return true;
  } catch {
    return false;
  }
}

/** "yyyy-mm" for a Date, using LOCAL calendar fields. */
export function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "yyyy-mm-dd" for a Date, using LOCAL calendar fields (never toISOString). */
export function isoFromDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayISO() {
  return isoFromDate(new Date());
}

/**
 * Parse "yyyy-mm-dd" as a LOCAL date.
 *
 * `new Date("2026-04-03")` is specified to parse as UTC midnight; reading it
 * back with getMonth()/getDate() then shifts the day for anyone west of UTC,
 * which silently moves transactions between months.
 */
export function parseISODate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return new Date(NaN);
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

/** Month membership by string prefix — timezone-proof and allocation-free. */
export function isInMonth(iso: string, month: Date) {
  return (iso || "").startsWith(monthKey(month));
}

/** Year membership by string prefix. */
export function isInYear(iso: string, year: number) {
  return (iso || "").startsWith(`${year}-`);
}

/** Format a stored yyyy-mm-dd for display without a timezone round-trip. */
export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions) {
  const d = parseISODate(iso);
  if (isNaN(d.getTime())) return iso || "—";
  return d.toLocaleDateString(undefined, opts);
}

/** "household" -> "Household". Single source of truth for profile casing. */
export function profileLabel(p: ProfileFilter | string): string {
  const s = String(p || "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
