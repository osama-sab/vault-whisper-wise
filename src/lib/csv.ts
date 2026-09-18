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

// ─── ROBUST DATE PARSER ────────────────────────────────
// Handles: dd.mm.yyyy, dd/mm/yyyy, mm/dd/yyyy, yyyy-mm-dd, yyyy/mm/dd,
// dd-mm-yyyy, "3 Oct 2024", "Oct 3, 2024", and many more

function tryParseDate(s: string, preferDMY: boolean): string | null {
  if (!s || !s.trim()) return null;
  const t = s.trim();

  // ISO: yyyy-mm-dd or yyyy/mm/dd
  let m = t.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) return isoDate(+m[1], +m[2], +m[3]);

  // European: dd.mm.yyyy or dd/mm/yyyy or dd-mm-yyyy
  m = t.match(/^(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{4})/);
  if (m) {
    if (preferDMY) return isoDate(+m[3], +m[2], +m[1]);
    // Ambiguous US vs EU: if first > 12 it must be day (EU), else respect preferDMY
    if (+m[1] > 12) return isoDate(+m[3], +m[2], +m[1]);
    if (+m[2] > 12) return isoDate(+m[3], +m[1], +m[2]); // mm/dd/yyyy
    return preferDMY ? isoDate(+m[3], +m[2], +m[1]) : isoDate(+m[3], +m[1], +m[2]);
  }

  // Short year: dd.mm.yy or dd/mm/yy
  m = t.match(/^(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{2})$/);
  if (m) {
    const year = +m[3] + (+m[3] > 50 ? 1900 : 2000);
    if (preferDMY) return isoDate(year, +m[2], +m[1]);
    if (+m[1] > 12) return isoDate(year, +m[2], +m[1]);
    return preferDMY ? isoDate(year, +m[2], +m[1]) : isoDate(year, +m[1], +m[2]);
  }

  // Named month: "3 Oct 2024", "Oct 3, 2024", "October 3 2024", etc.
  const MONTHS: Record<string, number> = {
    jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,
    jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,
    oct:10,october:10,nov:11,november:11,dec:12,december:12,
    // German
    jän:1,januar:1,februar:2,mär:3,märz:3,mai:5,juni:6,juli:7,
    okt:10,oktober:10,dez:12,dezember:12,
  };
  const lower = t.toLowerCase().replace(/[,\.]/g, " ").replace(/\s+/g, " ").trim();
  // "3 oct 2024" or "oct 3 2024"
  m = lower.match(/^(\d{1,2})\s+([a-zäö]+)\s+(\d{4})$/);
  if (m && MONTHS[m[2]]) return isoDate(+m[3], MONTHS[m[2]], +m[1]);
  m = lower.match(/^([a-zäö]+)\s+(\d{1,2})\s+(\d{4})$/);
  if (m && MONTHS[m[1]]) return isoDate(+m[3], MONTHS[m[1]], +m[2]);

  // Last resort: use JS Date constructor
  const d = new Date(t);
  if (!isNaN(d.getTime()) && d.getFullYear() > 1990 && d.getFullYear() < 2100) {
    return d.toISOString().slice(0, 10);
  }

  return null;
}

function isoDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseGermanNumber(s: string): number {
  if (!s) return 0;
  const cleaned = String(s).replace(/\./g, "").replace(",", ".").replace(/[^\d.\-+]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// ─── SPARKASSE COLUMN NAMES ────────────────────────────
// The Sparkasse CSV has varying column names depending on export version
const SPARKASSE_DATE_COLS = ["Valutadatum", "Buchungstag", "Wertstellungstag"];
const SPARKASSE_PAYEE_COLS = [
  "Beguenstigter/Zahlungspflichtiger", "Begünstigter/Zahlungspflichtiger",
  "Beguenstigter", "Begünstigter", "Zahlungsempfaenger", "Zahlungsempfänger",
  "Auftraggeber/Zahlungsempfänger", "Name",
];
const SPARKASSE_DESC_COLS = ["Verwendungszweck", "Buchungstext"];
const SPARKASSE_AMOUNT_COLS = ["Betrag", "Betrag (EUR)", "Umsatz"];

function findCol(row: Record<string, string>, candidates: string[]): string {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== "") return row[c];
  }
  return "";
}

// ─── MAIN PARSER ───────────────────────────────────────
export async function parseCSV(file: File, format: BankFormat): Promise<ParsedRow[]> {
  const text = await file.text();
  const delimiter = format === "sparkasse" ? ";" : undefined; // auto-detect for others
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^"|"$/g, "").replace(/^\uFEFF/, ""), // strip BOM
  });

  const preferDMY = format === "sparkasse" || format === "generic"; // German/EU = day first
  const rows: ParsedRow[] = [];

  for (const r of parsed.data) {
    if (!r || typeof r !== "object") continue;
    let dateStr = "", payee = "", desc = "", amountStr = "";

    if (format === "sparkasse") {
      // Prefer Valutadatum (actual transaction date), fallback to Buchungstag
      dateStr = findCol(r, SPARKASSE_DATE_COLS);
      payee = findCol(r, SPARKASSE_PAYEE_COLS);
      desc = findCol(r, SPARKASSE_DESC_COLS);
      amountStr = findCol(r, SPARKASSE_AMOUNT_COLS);
    } else if (format === "wise") {
      dateStr = r["Date"] || r["Created on"] || "";
      desc = r["Description"] || r["Reference"] || "";
      payee = r["Payee Name"] || r["Merchant"] || r["Target name"] || "";
      amountStr = r["Amount"] || r["Source amount (after fees)"] || "0";
    } else {
      // Generic: try all common column names
      dateStr = r["Date"] || r["date"] || r["Valutadatum"] || r["Buchungstag"] || r["Transaction Date"] || "";
      payee = r["Payee"] || r["payee"] || r["Merchant"] || r["Name"] || r["Beguenstigter"] || "";
      desc = r["Description"] || r["description"] || r["Memo"] || r["Verwendungszweck"] || r["Reference"] || "";
      amountStr = r["Amount"] || r["amount"] || r["Betrag"] || r["Value"] || "0";
    }

    const date = tryParseDate(dateStr, preferDMY);
    if (!date) continue;

    const amount = format === "wise"
      ? parseFloat(String(amountStr).replace(/,/g, "")) || 0
      : parseGermanNumber(amountStr);

    rows.push({ date, amount, payee: payee.trim(), description: desc.trim(), raw: r });
  }

  return rows;
}

/** Get a preview of first few rows and detected columns from a CSV */
export async function previewCSV(file: File, format: BankFormat): Promise<{
  headers: string[];
  rows: string[][];
  count: number;
}> {
  const text = await file.text();
  const delimiter = format === "sparkasse" ? ";" : undefined;
  const parsed = Papa.parse<string[]>(text, {
    header: false,
    delimiter,
    skipEmptyLines: true,
    preview: 6, // first 6 lines (header + 5 data rows)
  });
  const data = parsed.data.filter(r => r && r.length > 1);
  const headers = data[0] || [];
  const rows = data.slice(1, 6);
  const fullParsed = Papa.parse(text, { header: false, skipEmptyLines: true, delimiter });
  return { headers: headers.map(h => h.replace(/^\uFEFF/, "").trim()), rows, count: fullParsed.data.length - 1 };
}

export function rowHash(r: { date: string; amount: number; payee: string }) {
  return `${r.date}|${r.amount.toFixed(2)}|${(r.payee || "").trim().toLowerCase()}`;
}

export function exportTransactionsCSV(rows: Record<string, unknown>[]): string {
  return Papa.unparse(rows);
}

// ─── MERCHANT-BASED AUTO-CATEGORIZATION ────────────────
// When no rule matches, try to infer category from merchant database
export function autoCategorizeMerchant(
  payee: string,
  description: string,
  categories: Category[]
): { categoryId: string; profile: ProfileId } | null {
  const merchant = findMerchant(payee) || findMerchant(description);
  if (!merchant) return null;

  // Map merchant label to likely category type
  const label = merchant.label.toLowerCase();
  // These are heuristic guesses — user can override
  const typeGuess = inferCategoryType(label, merchant.keywords);
  const match = categories.find(c => c.type === typeGuess && c.profileDefault === "household")
    || categories.find(c => c.type === typeGuess);
  if (match) return { categoryId: match.id, profile: match.profileDefault };
  return null;
}

function inferCategoryType(label: string, keywords: string[]): string {
  const kw = keywords.join(" ") + " " + label;
  // Subscriptions and streaming
  if (/netflix|spotify|disney|prime|youtube|hbo|dazn|audible|crunchyroll|twitch|sky|waipu|mcfit|fitness|urban sports|john reed|clever fit|openai|chatgpt|notion|canva|github|icloud|dropbox|adobe|microsoft/i.test(kw)) return "bills";
  // Insurance
  if (/aok|dak|tk |barmer|ikk|hkk|krankenkasse/i.test(kw)) return "bills";
  // Telecoms & utilities
  if (/telekom|vodafone|o2|1und1|congstar|aldi talk|freenet|eon|vattenfall|enercity|rwe|stadtwerke|naturstrom|gez|rundfunk/i.test(kw)) return "bills";
  // Rent
  if (/miete|vermieter/i.test(kw)) return "bills";
  // Finance transfers (savings-like)
  if (/n26|ing|commerzbank|sparkasse|volksbank|dkb|wise|revolut/i.test(kw)) return "savings";
  // Everything else is expenses (groceries, shopping, transport, food, etc.)
  return "expenses";
}

export async function downloadFile(filename: string, content: string | Blob, mime = "text/csv") {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  if ("showSaveFilePicker" in window) {
    try {
      const ext = filename.split(".").pop() || "";
      const types: Record<string, any> = {
        csv: { description: "CSV file", accept: { "text/csv": [".csv"] } },
        pdf: { description: "PDF document", accept: { "application/pdf": [".pdf"] } },
        xlsx: { description: "Excel spreadsheet", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] } },
      };
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: types[ext] ? [types[ext]] : undefined,
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e: any) {
      if (e.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
