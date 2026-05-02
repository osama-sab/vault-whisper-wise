import Papa from "papaparse";

export interface ParsedRow {
  date: string; // ISO
  amount: number; // signed: negative=expense, positive=income
  payee: string;
  description: string;
  raw: Record<string, string>;
}

export type BankFormat = "sparkasse" | "wise" | "generic";

function parseGermanDate(s: string): string {
  // dd.mm.yyyy
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // ISO already
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function parseGermanNumber(s: string): number {
  if (!s) return 0;
  const cleaned = String(s).replace(/\./g, "").replace(",", ".").replace(/[^\d.\-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

export async function parseCSV(file: File, format: BankFormat): Promise<ParsedRow[]> {
  const text = await file.text();
  const delimiter = format === "sparkasse" ? ";" : ",";
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^"|"$/g, ""),
  });

  const rows: ParsedRow[] = [];
  for (const r of parsed.data) {
    if (!r || typeof r !== "object") continue;
    let row: ParsedRow | null = null;
    if (format === "sparkasse") {
      const date = r["Buchungstag"] || r["Valutadatum"] || "";
      const payee = r["Beguenstigter/Zahlungspflichtiger"] || r["Beguenstigter"] || r["Zahlungsempfaenger"] || "";
      const desc = r["Verwendungszweck"] || "";
      const amount = parseGermanNumber(r["Betrag"] || "");
      if (!date) continue;
      row = { date: parseGermanDate(date), amount, payee, description: desc, raw: r };
    } else if (format === "wise") {
      const date = r["Date"] || r["TransferWise ID"] ? r["Date"] : "";
      const desc = r["Description"] || r["Reference"] || "";
      const payee = r["Payee Name"] || r["Merchant"] || r["Target name"] || "";
      const amountStr = r["Amount"] || r["Source amount (after fees)"] || "0";
      const amount = parseFloat(String(amountStr).replace(/,/g, ""));
      if (!date) continue;
      row = { date: parseGermanDate(date), amount, payee, description: desc, raw: r };
    } else {
      // generic: try common fields
      const date = r["Date"] || r["date"] || r["Buchungstag"] || "";
      const payee = r["Payee"] || r["payee"] || r["Merchant"] || r["Beguenstigter"] || "";
      const desc = r["Description"] || r["description"] || r["Memo"] || r["Verwendungszweck"] || "";
      const amountStr = r["Amount"] || r["amount"] || r["Betrag"] || "0";
      const amount = parseGermanNumber(amountStr);
      if (!date) continue;
      row = { date: parseGermanDate(date), amount, payee, description: desc, raw: r };
    }
    if (row) rows.push(row);
  }
  return rows;
}

export function rowHash(r: { date: string; amount: number; payee: string }) {
  return `${r.date}|${r.amount.toFixed(2)}|${(r.payee || "").trim().toLowerCase()}`;
}

export function exportTransactionsCSV(rows: Record<string, unknown>[]): string {
  return Papa.unparse(rows);
}

export function downloadFile(filename: string, content: string | Blob, mime = "text/csv") {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}