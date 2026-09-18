import Papa from "papaparse";
import { findMerchant } from "./merchants";
import type { Category, ProfileId } from "./types";

export interface ParsedRow {
  date: string; // ISO yyyy-mm-dd
  amount: number; // signed: negative=expense, positive=income
  payee: string;
  description: string;
  raw: Record<string, string>;
}

export type BankFormat = "sparkasse" | "wise" | "generic";

/** Which component comes first in an all-numeric date. */
export type DateOrder = "dmy" | "mdy";

// ─── DATE PARSING ──────────────────────────────────────
// Handles: dd.mm.yyyy, dd/mm/yyyy, mm/dd/yyyy, yyyy-mm-dd, yyyy/mm/dd,
// dd-mm-yyyy, dd.mm.yy, "3 Oct 2024", "Oct 3, 2024", German month names.
//
// The day/month order of an all-numeric date is NOT guessed per row — it is
// detected once for the whole file by detectDateOrder() and passed in, so a
// statement cannot end up with some rows read dd/mm and others mm/dd.

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  // German
  "jän": 1, januar: 1, februar: 2, "mär": 3, "märz": 3, mai: 5, juni: 6, juli: 7,
  okt: 10, oktober: 10, dez: 12, dezember: 12,
};

/** Matches an all-numeric date, capturing the three components in order. */
const NUMERIC_DATE = /^(\d{1,4})[./-](\d{1,2})[./-](\d{2,4})/;

export function tryParseDate(s: string, order: DateOrder = "dmy"): string | null {
  if (!s || !String(s).trim()) return null;
  // Drop any trailing time-of-day; we only ever store a calendar date.
  const t = String(s).trim().replace(/[T\s]+\d{1,2}:\d{2}(:\d{2})?.*$/, "").trim();

  // ISO first: yyyy-mm-dd or yyyy/mm/dd (unambiguous)
  let m = t.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (m) return isoDate(+m[1], +m[2], +m[3]);

  // All-numeric, year last: dd.mm.yyyy / mm.dd.yyyy / dd.mm.yy
  m = t.match(NUMERIC_DATE);
  if (m && m[1].length <= 2) {
    const a = +m[1], b = +m[2];
    const year = normalizeYear(+m[3], m[3].length);
    // An out-of-range component settles the order regardless of the file default.
    if (a > 12 && b <= 12) return isoDate(year, b, a);
    if (b > 12 && a <= 12) return isoDate(year, a, b);
    return order === "dmy" ? isoDate(year, b, a) : isoDate(year, a, b);
  }

  // Named month: "3 Oct 2024", "Oct 3, 2024", "3. März 2024"
  const lower = t.toLowerCase().replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
  m = lower.match(/^(\d{1,2})\s+([a-zäöü]+)\s+(\d{2,4})$/);
  if (m && MONTHS[m[2]]) return isoDate(normalizeYear(+m[3], m[3].length), MONTHS[m[2]], +m[1]);
  m = lower.match(/^([a-zäöü]+)\s+(\d{1,2})\s+(\d{2,4})$/);
  if (m && MONTHS[m[1]]) return isoDate(normalizeYear(+m[3], m[3].length), MONTHS[m[1]], +m[2]);

  // Last resort: the JS Date parser, read back with LOCAL getters.
  // (toISOString() here would shift the day by one for most of Europe.)
  const d = new Date(t);
  if (!isNaN(d.getTime()) && d.getFullYear() > 1990 && d.getFullYear() < 2100) {
    return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  return null;
}

function normalizeYear(y: number, digits: number): number {
  if (digits > 2) return y;
  return y + (y > 50 ? 1900 : 2000);
}

function isoDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || y < 1990 || y > 2100) return null;
  // Reject impossible days (31 Feb, 31 Apr, non-leap 29 Feb).
  if (d > new Date(y, m, 0).getDate()) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Decide dd/mm vs mm/dd for a whole file by looking for rows where one
 * component exceeds 12 and therefore must be the day (or must be the month).
 * Falls back to dmy, which is right for every European export this app targets.
 */
export function detectDateOrder(samples: string[]): { order: DateOrder; confident: boolean } {
  let dmy = 0, mdy = 0;
  for (const s of samples) {
    const m = String(s || "").trim().match(NUMERIC_DATE);
    if (!m || m[1].length > 2) continue;
    const a = +m[1], b = +m[2];
    if (a > 12 && b <= 12) dmy++;
    else if (b > 12 && a <= 12) mdy++;
  }
  if (dmy && !mdy) return { order: "dmy", confident: true };
  if (mdy && !dmy) return { order: "mdy", confident: true };
  if (dmy || mdy) return { order: dmy >= mdy ? "dmy" : "mdy", confident: false };
  return { order: "dmy", confident: false };
}

// ─── AMOUNT PARSING ────────────────────────────────────

/**
 * Parse a monetary string written in ANY common locale.
 *
 * The decimal separator is whichever of "." and "," appears last; when only one
 * separator is present and exactly three digits follow it, it is read as a
 * thousands separator ("1.234" -> 1234), since money is not written to three
 * decimal places. Handles leading/trailing minus and accounting parentheses.
 */
export function parseAmount(s: unknown): number {
  if (s == null) return 0;
  const t = String(s).trim();
  if (!t) return 0;

  const negative = /^\(.*\)$/.test(t) || /^-/.test(t) || /-\s*$/.test(t);
  const cleaned = t.replace(/[^\d.,]/g, "");
  if (!cleaned) return 0;

  const dots = (cleaned.match(/\./g) || []).length;
  const commas = (cleaned.match(/,/g) || []).length;
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");

  let normalized = cleaned;
  if (dots && commas) {
    normalized = lastDot > lastComma
      ? cleaned.replace(/,/g, "")                       // 1,234.56
      : cleaned.replace(/\./g, "").replace(",", ".");   // 1.234,56
  } else if (dots > 1) {
    normalized = cleaned.replace(/\./g, "");            // 1.234.567
  } else if (commas > 1) {
    normalized = cleaned.replace(/,/g, "");             // 1,234,567
  } else if (dots === 1) {
    const after = cleaned.length - lastDot - 1;
    normalized = after === 3 ? cleaned.replace(".", "") : cleaned;
  } else if (commas === 1) {
    const after = cleaned.length - lastComma - 1;
    normalized = after === 3 ? cleaned.replace(",", "") : cleaned.replace(",", ".");
  }

  const n = parseFloat(normalized);
  if (isNaN(n)) return 0;
  return negative ? -Math.abs(n) : n;
}

// ─── COLUMN NAMES ──────────────────────────────────────
// Sparkasse CSV-CAMT column names vary by export version.
// Valutadatum (value date) is preferred: it is the day the money actually
// moved, not the day the bank got round to booking it.
const SPARKASSE_DATE_COLS = ["Valutadatum", "Wertstellungstag", "Wertstellung", "Buchungstag", "Buchungsdatum"];
const SPARKASSE_PAYEE_COLS = [
  "Beguenstigter/Zahlungspflichtiger", "Begünstigter/Zahlungspflichtiger",
  "Beguenstigter", "Begünstigter", "Zahlungsempfaenger", "Zahlungsempfänger",
  "Auftraggeber/Zahlungsempfänger", "Name",
];
const SPARKASSE_DESC_COLS = ["Verwendungszweck", "Buchungstext"];
const SPARKASSE_AMOUNT_COLS = ["Betrag", "Betrag (EUR)", "Umsatz"];
/** "S" = Soll (debit), "H" = Haben (credit) — some exports put the sign here. */
const SPARKASSE_SIGN_COLS = ["Soll/Haben-Kennzeichen", "Soll/Haben", "S/H"];

const GENERIC_DATE_COLS = ["Date", "date", "DATE", "Valutadatum", "Buchungstag", "Transaction Date", "Datum", "Booking Date", "Completed Date"];
const GENERIC_PAYEE_COLS = ["Payee", "payee", "Merchant", "Name", "Beguenstigter", "Begünstigter", "Counterparty", "To", "Beneficiary"];
const GENERIC_DESC_COLS = ["Description", "description", "Memo", "Verwendungszweck", "Reference", "Notes", "Details"];
const GENERIC_AMOUNT_COLS = ["Amount", "amount", "Betrag", "Value"];

function findCol(row: Record<string, string>, candidates: string[]): string {
  for (const c of candidates) {
    if (row[c] !== undefined && String(row[c]).trim() !== "") return String(row[c]);
  }
  return "";
}

/** The first candidate column actually present in the parsed header. */
function whichCol(headers: string[], candidates: string[]): string | null {
  for (const c of candidates) if (headers.includes(c)) return c;
  return null;
}

export function columnsFor(format: BankFormat) {
  if (format === "sparkasse") {
    return { date: SPARKASSE_DATE_COLS, payee: SPARKASSE_PAYEE_COLS, desc: SPARKASSE_DESC_COLS, amount: SPARKASSE_AMOUNT_COLS };
  }
  if (format === "wise") {
    return {
      date: ["Date", "Created on", "Finished on"],
      payee: ["Payee Name", "Merchant", "Target name", "Recipient"],
      desc: ["Description", "Reference", "Payment Reference"],
      amount: ["Amount", "Source amount (after fees)", "Target amount"],
    };
  }
  return { date: GENERIC_DATE_COLS, payee: GENERIC_PAYEE_COLS, desc: GENERIC_DESC_COLS, amount: GENERIC_AMOUNT_COLS };
}

const HEADER_TRANSFORM = (h: string) => h.trim().replace(/^\uFEFF/, "").replace(/^"|"$/g, "");

function delimiterFor(format: BankFormat) {
  return format === "sparkasse" ? ";" : undefined; // auto-detect for others
}

// ─── MAIN PARSER ───────────────────────────────────────

export interface ParseOptions {
  /** Override the detected day/month order. */
  dateOrder?: DateOrder;
}

export interface ParseResult {
  rows: ParsedRow[];
  /** Rows the parser had to drop, with the reason — surfaced in the wizard. */
  skipped: { line: number; reason: string }[];
  dateOrder: DateOrder;
}

export async function parseCSV(file: File, format: BankFormat, opts: ParseOptions = {}): Promise<ParseResult> {
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter: delimiterFor(format),
    skipEmptyLines: true,
    transformHeader: HEADER_TRANSFORM,
  });

  const cols = columnsFor(format);
  const data = (parsed.data || []).filter((r) => r && typeof r === "object");

  // Detect the date order across the WHOLE file before parsing any single row.
  const dateOrder = opts.dateOrder ?? detectDateOrder(data.map((r) => findCol(r, cols.date))).order;

  const rows: ParsedRow[] = [];
  const skipped: ParseResult["skipped"] = [];

  data.forEach((r, i) => {
    const dateStr = findCol(r, cols.date);
    const payee = findCol(r, cols.payee);
    const desc = findCol(r, cols.desc);
    const amountStr = findCol(r, cols.amount);

    const date = tryParseDate(dateStr, dateOrder);
    if (!date) {
      // A blank trailing row is not worth reporting.
      if (dateStr || amountStr || payee) {
        skipped.push({ line: i + 2, reason: dateStr ? `Unrecognised date "${dateStr}"` : "No date column found" });
      }
      return;
    }

    let amount = parseAmount(amountStr);

    // Sparkasse may carry the direction in a separate Soll/Haben column.
    const sign = findCol(r, SPARKASSE_SIGN_COLS).trim().toUpperCase();
    if (sign === "S") amount = -Math.abs(amount);
    else if (sign === "H") amount = Math.abs(amount);

    // Some exports split direction across two columns instead of using a sign.
    if (amount === 0) {
      const out = parseAmount(r["Paid Out"]);
      const inn = parseAmount(r["Paid In"]);
      if (out) amount = -Math.abs(out);
      else if (inn) amount = Math.abs(inn);
    }

    if (amount === 0) {
      skipped.push({ line: i + 2, reason: `Could not read an amount from "${amountStr}"` });
      return;
    }

    rows.push({ date, amount, payee: payee.trim(), description: desc.trim(), raw: r });
  });

  return { rows, skipped, dateOrder };
}

/** Preview for the import wizard: headers, first rows, and what we mapped. */
export interface PreviewResult {
  headers: string[];
  rows: string[][];
  count: number;
  mapping: { date: string | null; payee: string | null; desc: string | null; amount: string | null };
  dateOrder: DateOrder;
  dateOrderConfident: boolean;
  sampleDates: { raw: string; parsed: string | null }[];
}

export async function previewCSV(file: File, format: BankFormat, opts: ParseOptions = {}): Promise<PreviewResult> {
  const text = await file.text();

  // One header-mode parse gives us the mapping, the sample rows and the count,
  // so the file is not parsed twice as it was before.
  const keyed = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter: delimiterFor(format),
    skipEmptyLines: true,
    transformHeader: HEADER_TRANSFORM,
  });
  const headers = (keyed.meta.fields || []).map(HEADER_TRANSFORM);
  const data = (keyed.data || []).filter((r) => r && typeof r === "object");

  const cols = columnsFor(format);
  const mapping = {
    date: whichCol(headers, cols.date),
    payee: whichCol(headers, cols.payee),
    desc: whichCol(headers, cols.desc),
    amount: whichCol(headers, cols.amount),
  };

  const rawDates = data.map((r) => findCol(r, cols.date));
  const detected = detectDateOrder(rawDates);
  const dateOrder = opts.dateOrder ?? detected.order;

  return {
    headers,
    rows: data.slice(0, 5).map((r) => headers.map((h) => String(r[h] ?? ""))),
    count: data.length,
    mapping,
    dateOrder,
    dateOrderConfident: detected.confident,
    sampleDates: rawDates.filter(Boolean).slice(0, 5).map((raw) => ({ raw, parsed: tryParseDate(raw, dateOrder) })),
  };
}

/**
 * Identity of a transaction for duplicate detection.
 *
 * Must be computed from the NORMALISED shape that gets persisted — a stored
 * transaction keeps an unsigned amount and may have had its payee blanked by
 * vague mode, so hashing the raw signed CSV row would never match it again.
 */
export function rowHash(r: { date: string; amount: number; payee: string; description?: string; isCredit?: boolean }) {
  const cents = Math.round(Math.abs(r.amount) * 100);
  const dir = (r.isCredit ?? r.amount > 0) ? "C" : "D";
  const who = (r.payee || r.description || "").trim().toLowerCase().replace(/\s+/g, " ");
  return `${r.date}|${dir}|${cents}|${who}`;
}

export function exportTransactionsCSV(rows: Record<string, unknown>[]): string {
  return Papa.unparse(rows);
}

// ─── MERCHANT-BASED AUTO-CATEGORIZATION ────────────────

/**
 * Infer a category from the merchant database.
 *
 * `isCredit` matters: a refund from a shop must not land in an expense
 * category, or the sign gets flipped and the month swings by twice the amount.
 */
export function autoCategorizeMerchant(
  payee: string,
  description: string,
  categories: Category[],
  isCredit: boolean
): { categoryId: string; profile: ProfileId } | null {
  // Prefer the payee field; the free-text description is far noisier.
  const merchant = findMerchant(payee) || findMerchant(description);
  if (!merchant) return null;

  if (isCredit) {
    const income = categories.find((c) => c.type === "income");
    return income ? { categoryId: income.id, profile: income.profileDefault } : null;
  }

  const typeGuess = inferCategoryType(merchant.label, merchant.keywords);
  const match = categories.find((c) => c.type === typeGuess) || categories.find((c) => c.type === "expenses");
  if (!match) return null;
  // Let the matched category's own default decide the profile.
  return { categoryId: match.id, profile: match.profileDefault };
}

function inferCategoryType(label: string, keywords: string[]) {
  const kw = `${keywords.join(" ")} ${label}`;
  if (/netflix|spotify|disney|prime|youtube|hbo|dazn|audible|crunchyroll|twitch|sky|waipu|mcfit|fitness|urban sports|john reed|clever fit|openai|chatgpt|notion|canva|github|icloud|dropbox|adobe|microsoft/i.test(kw)) return "bills";
  if (/aok|dak|techniker krankenkasse|barmer|ikk|hkk|krankenkasse/i.test(kw)) return "bills";
  if (/telekom|vodafone|telefonica|1und1|congstar|aldi talk|freenet|e\.on|vattenfall|enercity|rwe|stadtwerke|naturstrom|gez|rundfunk/i.test(kw)) return "bills";
  if (/miete|vermieter/i.test(kw)) return "bills";
  if (/n26|ing|commerzbank|sparkasse|volksbank|dkb|wise|revolut/i.test(kw)) return "savings";
  return "expenses";
}

// ─── DOWNLOAD ──────────────────────────────────────────

export async function downloadFile(filename: string, content: string | Blob, mime = "text/csv") {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  if ("showSaveFilePicker" in window) {
    try {
      const ext = filename.split(".").pop() || "";
      const types: Record<string, unknown> = {
        csv: { description: "CSV file", accept: { "text/csv": [".csv"] } },
        pdf: { description: "PDF document", accept: { "application/pdf": [".pdf"] } },
      };
      const handle = await (window as unknown as { showSaveFilePicker: (o: unknown) => Promise<FileSystemFileHandle> })
        .showSaveFilePicker({ suggestedName: filename, types: types[ext] ? [types[ext]] : undefined });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      // Any other failure falls through to the anchor-download path below.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
