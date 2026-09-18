import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Category, Transaction, Subscription, ProfileFilter, ProfileId } from "./types";
import { formatMoney } from "./format";
import { downloadFile, exportTransactionsCSV } from "./csv";
import { findMerchant } from "./merchants";

const TEAL = [15, 118, 110] as const;
const GREEN = [16, 185, 129] as const;
const RED = [239, 68, 68] as const;
const GRAY = [100, 116, 139] as const;
const LIGHT_GREEN = [220, 252, 231] as const;
const LIGHT_RED = [254, 226, 226] as const;
const DARK_TEAL = [10, 80, 75] as const;
const BLUE = [59, 130, 246] as const;

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

export interface ExportOptions {
  months: Date[];
  transactions: Transaction[];
  categories: Category[];
  subscriptions: Subscription[];
  discreet: boolean;
  profile: ProfileFilter;
  currency: string;
  openingBalance: number;
  formats: ("pdf" | "csv" | "xlsx")[];
}

export async function exportReport(opts: ExportOptions) {
  if (opts.formats.includes("pdf")) await generatePDF(opts);
  if (opts.formats.includes("csv")) await generateCSV(opts);
}

// Helper: compute totals for a set of transactions
function computeTotals(txs: Transaction[], catMap: Map<string, Category>, subs: Subscription[]) {
  let credit = 0, debit = 0;
  const catTotals = new Map<string, { credit: number; debit: number }>();
  for (const t of txs) {
    const c = catMap.get(t.categoryId);
    if (!c) continue;
    const isIn = c.type === "income";
    if (isIn) credit += t.amount; else debit += t.amount;
    const ct = catTotals.get(c.id) || { credit: 0, debit: 0 };
    if (isIn) ct.credit += t.amount; else ct.debit += t.amount;
    catTotals.set(c.id, ct);
  }
  const subsTotal = subs.filter(s => s.active).reduce((sum, s) => sum + s.expectedAmount, 0);
  return { credit, debit, subsTotal, catTotals };
}

function ensureSpace(doc: jsPDF, needed: number): number {
  const y = (doc as any).lastAutoTable?.finalY || 20;
  if (y + needed > 270) { doc.addPage(); return 20; }
  return y + 6;
}

function addSummaryTable(doc: jsPDF, label: string, startY: number, openBal: number, credit: number, debit: number, subsTotal: number, currency: string) {
  const closeBal = openBal + credit - debit - subsTotal;
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text(label, 14, startY);
  autoTable(doc, {
    startY: startY + 3,
    head: [["", "Amount"]],
    body: [
      ["Opening Balance", formatMoney(openBal, currency)],
      ["Total Credit (Income)", `+ ${formatMoney(credit, currency)}`],
      ["Total Debit (Expenses + Bills + Savings + Debt)", `- ${formatMoney(debit, currency)}`],
      ["Subscriptions (committed)", `- ${formatMoney(subsTotal, currency)}`],
      ["Closing Balance", formatMoney(closeBal, currency)],
    ],
    headStyles: { fillColor: [...TEAL] },
    bodyStyles: { fontSize: 9 },
    didParseCell(data: any) {
      const row = data.row.index;
      if (data.column.index === 1) {
        if (row === 1) data.cell.styles.textColor = [...GREEN];
        if (row === 2 || row === 3) data.cell.styles.textColor = [...RED];
        if (row === 4) { data.cell.styles.fontStyle = "bold"; data.cell.styles.textColor = closeBal >= 0 ? [...GREEN] : [...RED]; }
      }
      if (row === 0 || row === 4) data.cell.styles.fontStyle = "bold";
    },
  });
  return closeBal;
}

// ─── PDF ───────────────────────────────────────────────
async function generatePDF(opts: ExportOptions) {
  const { months, transactions, categories, subscriptions, discreet, profile, currency, openingBalance } = opts;
  const doc = new jsPDF();
  const catMap = new Map(categories.map(c => [c.id, c]));
  const profileLabel = profile === "combined" ? "Combined" : cap(profile);
  const isCombined = profile === "combined";
  const isYearly = months.length > 1;
  const title = isYearly
    ? `Pocket Money — ${months[0].getFullYear()} Annual Report`
    : `Pocket Money — ${months[0].toLocaleDateString(undefined, { month: "long", year: "numeric" })}`;

  // Cover
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, 210, 40, "F");
  doc.setTextColor(255);
  doc.setFontSize(20);
  doc.text(title, 14, 22);
  doc.setFontSize(10);
  doc.text(`Profile: ${profileLabel}${discreet ? "  ·  Discreet mode" : ""}`, 14, 32);
  doc.setTextColor(0);

  let runningBalance = openingBalance;

  for (let mi = 0; mi < months.length; mi++) {
    const m = months[mi];
    const mKey = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
    const monthTx = transactions.filter(t => t.date.startsWith(mKey)).sort((a, b) => a.date.localeCompare(b.date));
    const monthLabel = m.toLocaleDateString(undefined, { month: "long", year: "numeric" });

    if (mi > 0) doc.addPage();
    const pageStartY = mi === 0 ? 50 : 20;
    doc.setFontSize(15);
    doc.setTextColor(0);
    doc.text(monthLabel, 14, pageStartY);

    const allTotals = computeTotals(monthTx, catMap, subscriptions);
    const openBal = runningBalance;

    if (isCombined) {
      // ── 1. COMBINED SUMMARY ──────────────────────
      const closeBal = addSummaryTable(doc, "Combined Overview", pageStartY + 6, openBal,
        allTotals.credit, allTotals.debit, allTotals.subsTotal, currency);
      runningBalance = closeBal;

      // ── 2. HOUSEHOLD SUMMARY ─────────────────────
      const hhTx = monthTx.filter(t => t.profile === "household");
      const hhSubs = subscriptions.filter(s => s.profile === "household");
      const hhTotals = computeTotals(hhTx, catMap, hhSubs);
      let y = ensureSpace(doc, 50);
      addSummaryTable(doc, "Household", y, openBal, hhTotals.credit, hhTotals.debit, hhTotals.subsTotal, currency);

      // ── 3. PERSONAL SUMMARY ──────────────────────
      const pTx = monthTx.filter(t => t.profile === "personal");
      const pSubs = subscriptions.filter(s => s.profile === "personal");
      const pTotals = computeTotals(pTx, catMap, pSubs);
      y = ensureSpace(doc, 50);
      addSummaryTable(doc, "Personal", y, 0, pTotals.credit, pTotals.debit, pTotals.subsTotal, currency);

      // ── 4. CATEGORY BREAKDOWN — separated by profile ──
      y = ensureSpace(doc, 30);
      doc.setFontSize(11);
      doc.text("Category Breakdown", 14, y);

      // Build rows: Household first, then separator, then Personal
      const buildCatRows = (txs: Transaction[], profileId: ProfileId) => {
        const t = computeTotals(txs, catMap, []);
        return [...t.catTotals.entries()].map(([id, ct]) => {
          const c = catMap.get(id)!;
          return { name: c.name, type: cap(c.type), credit: ct.credit, debit: ct.debit, budget: c.monthlyBudget, profile: profileId };
        }).sort((a, b) => a.type.localeCompare(b.type));
      };

      const hhCatRows = buildCatRows(hhTx, "household");
      const pCatRows = buildCatRows(pTx, "personal");
      const SEP = { name: "", type: "", credit: -1, debit: -1, budget: -1, profile: "separator" as any };
      const allCatRows = [...hhCatRows, SEP, ...pCatRows];

      autoTable(doc, {
        startY: y + 4,
        head: [["Category", "Type", "Credit", "Debit", "Budget"]],
        body: allCatRows.map(r => {
          if (r.profile === "separator") return [{ content: "PERSONAL", colSpan: 5, styles: { fontStyle: "bold" as const, fillColor: [230, 230, 230], textColor: [80, 80, 80], halign: "left" as const, fontSize: 9 } }];
          return [
            r.name, r.type,
            r.credit > 0 ? `+ ${formatMoney(r.credit, currency)}` : "—",
            r.debit > 0 ? `- ${formatMoney(r.debit, currency)}` : "—",
            r.budget > 0 ? formatMoney(r.budget, currency) : "—",
          ];
        }),
        headStyles: { fillColor: [...TEAL] },
        bodyStyles: { fontSize: 8 },
        didParseCell(data: any) {
          if (data.section !== "body") return;
          const r = allCatRows[data.row.index];
          if (!r || r.profile === "separator") return;
          if (data.column.index === 2 && r.credit > 0) data.cell.styles.textColor = [...GREEN];
          if (data.column.index === 3 && r.debit > 0) data.cell.styles.textColor = [...RED];
        },
        willDrawCell(data: any) {
          // Add "HOUSEHOLD" header before first row
          if (data.section === "body" && data.row.index === 0 && data.column.index === 0) {
            const d = data.doc as jsPDF;
            d.setFontSize(9);
            d.setFont("helvetica", "bold");
            d.setTextColor(80);
            d.setFillColor(230, 230, 230);
            d.rect(data.cell.x, data.cell.y - 7, 182, 7, "F");
            d.text("HOUSEHOLD", data.cell.x + 2, data.cell.y - 2);
          }
        },
      });
    } else {
      // ── SINGLE PROFILE SUMMARY ───────────────────
      const closeBal = addSummaryTable(doc, profileLabel, pageStartY + 6, openBal,
        allTotals.credit, allTotals.debit, allTotals.subsTotal, currency);
      runningBalance = closeBal;

      // Category breakdown (single profile)
      const catRows = [...allTotals.catTotals.entries()].map(([id, t]) => {
        const c = catMap.get(id)!;
        return { name: c.name, type: cap(c.type), credit: t.credit, debit: t.debit, budget: c.monthlyBudget };
      }).sort((a, b) => a.type.localeCompare(b.type));

      if (catRows.length > 0) {
        autoTable(doc, {
          startY: (doc as any).lastAutoTable.finalY + 6,
          head: [["Category", "Type", "Credit", "Debit", "Budget"]],
          body: catRows.map(r => [
            r.name, r.type,
            r.credit > 0 ? `+ ${formatMoney(r.credit, currency)}` : "—",
            r.debit > 0 ? `- ${formatMoney(r.debit, currency)}` : "—",
            r.budget > 0 ? formatMoney(r.budget, currency) : "—",
          ]),
          headStyles: { fillColor: [...TEAL] },
          bodyStyles: { fontSize: 8 },
          didParseCell(data: any) {
            if (data.column.index === 2 && data.cell.text[0] !== "—") data.cell.styles.textColor = [...GREEN];
            if (data.column.index === 3 && data.cell.text[0] !== "—") data.cell.styles.textColor = [...RED];
          },
        });
      }
    }

    // ── SUBSCRIPTIONS ──────────────────────────────
    const activeSubs = subscriptions.filter(s => s.active);
    if (activeSubs.length > 0) {
      let y = ensureSpace(doc, 30);
      doc.setFontSize(11);
      doc.text("Recurring Subscriptions", 14, y);
      autoTable(doc, {
        startY: y + 4,
        head: [["Name", "Due Day", "Category", "Profile", "Amount"]],
        body: activeSubs.map(s => [
          s.name, `Day ${s.dueDay}`,
          catMap.get(s.categoryId)?.name || "—",
          cap(s.profile),
          formatMoney(s.expectedAmount, currency),
        ]),
        headStyles: { fillColor: [...TEAL] },
        bodyStyles: { fontSize: 8 },
      });
    }

    // ── TRANSACTION DETAIL ─────────────────────────
    if (monthTx.length > 0) {
      let y = ensureSpace(doc, 30);
      doc.setFontSize(11);
      doc.text("Transaction Detail", 14, y);

      const txRows = monthTx.map(t => {
        const c = catMap.get(t.categoryId);
        const isIncome = c?.type === "income";
        const merchant = findMerchant(t.payee);
        const payeeDisplay = discreet ? (c?.genericLabel || "—") : (merchant ? merchant.label : (t.payee || "—"));
        const descDisplay = discreet ? "" : (t.description || "");
        return {
          row: [
            t.date,
            isIncome ? "Credit" : "Debit",
            payeeDisplay,
            c?.name || "—",
            cap(t.profile),
            descDisplay,
            isIncome ? `+ ${formatMoney(t.amount, currency)}` : `- ${formatMoney(t.amount, currency)}`,
          ],
          isIncome,
        };
      });

      autoTable(doc, {
        startY: y + 4,
        head: [["Date", "Type", "Payee", "Category", "Profile", "Description", "Amount"]],
        body: txRows.map(r => r.row),
        headStyles: { fillColor: [...TEAL] },
        bodyStyles: { fontSize: 7 },
        columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 14 }, 5: { cellWidth: 38 }, 6: { cellWidth: 24 } },
        didParseCell(data: any) {
          if (data.section !== "body") return;
          const isIncome = txRows[data.row.index]?.isIncome;
          if (data.column.index === 1) { data.cell.styles.textColor = isIncome ? [...GREEN] : [...RED]; data.cell.styles.fontStyle = "bold"; }
          if (data.column.index === 6) { data.cell.styles.textColor = isIncome ? [...GREEN] : [...RED]; data.cell.styles.fontStyle = "bold"; }
          data.cell.styles.fillColor = isIncome ? [...LIGHT_GREEN] : data.row.index % 2 === 0 ? [255, 255, 255] : [...LIGHT_RED];
        },
      });

      const fy = (doc as any).lastAutoTable.finalY + 4;
      if (fy < 280) {
        doc.setFontSize(9);
        doc.setTextColor(...GRAY);
        doc.text(`Opening: ${formatMoney(openBal, currency)}  |  Closing: ${formatMoney(isCombined ? openBal + allTotals.credit - allTotals.debit - allTotals.subsTotal : runningBalance, currency)}`, 14, fy);
      }
    }
  }

  // Page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(180);
    doc.text(`Pocket Money · Page ${i} of ${pageCount}`, 14, 290);
    doc.text(new Date().toLocaleDateString(), 180, 290);
  }

  const period = isYearly ? months[0].getFullYear().toString() : months[0].toLocaleDateString(undefined, { month: "short", year: "numeric" }).replace(/\s/g, "-");
  const blob = doc.output("blob");
  await downloadFile(`pocket-money-${profileLabel.toLowerCase()}-${period}.pdf`, blob, "application/pdf");
}

// ─── CSV ───────────────────────────────────────────────
async function generateCSV(opts: ExportOptions) {
  const { transactions, categories, profile, currency, discreet } = opts;
  const catMap = new Map(categories.map(c => [c.id, c]));
  const profileLabel = profile === "combined" ? "Combined" : cap(profile);

  const rows = transactions.map(t => {
    const c = catMap.get(t.categoryId);
    const isIncome = c?.type === "income";
    const merchant = findMerchant(t.payee);
    return {
      Date: t.date,
      Type: isIncome ? "Credit" : "Debit",
      Profile: cap(t.profile),
      Category: c?.name || "",
      "Category Type": cap(c?.type || ""),
      Payee: discreet ? "" : (merchant ? merchant.label : t.payee),
      Description: discreet ? (c?.genericLabel || "") : t.description,
      Amount: isIncome ? t.amount : -t.amount,
    };
  });

  const period = opts.months.length > 1
    ? opts.months[0].getFullYear().toString()
    : opts.months[0].toLocaleDateString(undefined, { month: "short", year: "numeric" }).replace(/\s/g, "-");

  await downloadFile(`pocket-money-${profileLabel.toLowerCase()}-${period}.csv`, exportTransactionsCSV(rows));
}
