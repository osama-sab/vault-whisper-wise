import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Category, Transaction } from "./types";
import { formatMoney } from "./format";

export function generateMonthPDF(opts: {
  month: Date;
  transactions: Transaction[];
  categories: Category[];
  discreet: boolean;
  profileLabel: string;
  currency: string;
}) {
  const { month, transactions, categories, discreet, profileLabel, currency } = opts;
  const doc = new jsPDF();
  const monthLabel = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  doc.setFontSize(20);
  doc.text("Pocket Budget — Monthly Report", 14, 18);
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`${monthLabel}  •  Profile: ${profileLabel}${discreet ? "  •  Discreet" : ""}`, 14, 26);

  // Category summary
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, number>();
  let income = 0, expenses = 0, savings = 0, debt = 0, bills = 0;
  for (const t of transactions) {
    const c = catMap.get(t.categoryId);
    if (!c) continue;
    totals.set(c.id, (totals.get(c.id) || 0) + t.amount);
    if (c.type === "income") income += t.amount;
    else if (c.type === "expenses") expenses += t.amount;
    else if (c.type === "savings") savings += t.amount;
    else if (c.type === "debt") debt += t.amount;
    else if (c.type === "bills") bills += t.amount;
  }

  autoTable(doc, {
    startY: 34,
    head: [["Type", "Total"]],
    body: [
      ["Income", formatMoney(income, currency)],
      ["Bills", formatMoney(bills, currency)],
      ["Expenses", formatMoney(expenses, currency)],
      ["Savings", formatMoney(savings, currency)],
      ["Debt", formatMoney(debt, currency)],
      ["Net", formatMoney(income - bills - expenses - savings - debt, currency)],
    ],
    theme: "striped",
    headStyles: { fillColor: [15, 118, 110] },
  });

  // Category breakdown
  const catRows = [...totals.entries()]
    .map(([id, total]) => {
      const c = catMap.get(id)!;
      return [c.name, c.type, formatMoney(total, currency), formatMoney(c.monthlyBudget, currency)];
    })
    .sort((a, b) => String(a[1]).localeCompare(String(b[1])));

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 8,
    head: [["Category", "Type", "Spent", "Budget"]],
    body: catRows,
    headStyles: { fillColor: [15, 118, 110] },
  });

  // Bar chart of expenses by category
  const expRows = catRows.filter((r) => r[1] === "expenses" || r[1] === "bills");
  if (expRows.length) {
    const startY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(13);
    doc.setTextColor(0);
    doc.text("Spending by Category", 14, startY);
    const max = Math.max(...expRows.map((r) => parseFloat(String(r[2]).replace(/[^\d.\-]/g, "")) || 0));
    let y = startY + 6;
    for (const r of expRows) {
      const val = parseFloat(String(r[2]).replace(/[^\d.\-]/g, "")) || 0;
      const w = max > 0 ? (val / max) * 120 : 0;
      doc.setFontSize(9);
      doc.setTextColor(60);
      doc.text(String(r[0]), 14, y + 4);
      doc.setFillColor(15, 118, 110);
      doc.rect(60, y, w, 5, "F");
      doc.text(String(r[2]), 60 + w + 2, y + 4);
      y += 8;
      if (y > 270) { doc.addPage(); y = 20; }
    }
  }

  // Transaction detail (omitted in discreet)
  if (!discreet) {
    doc.addPage();
    doc.setFontSize(15);
    doc.text("Transactions", 14, 18);
    autoTable(doc, {
      startY: 24,
      head: [["Date", "Category", "Profile", "Payee", "Description", "Amount"]],
      body: transactions
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((t) => {
          const c = catMap.get(t.categoryId);
          return [
            t.date,
            c?.name || "—",
            t.profile,
            t.payee || "",
            t.description || "",
            formatMoney(t.amount, currency),
          ];
        }),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 118, 110] },
    });
  }

  doc.save(`pocket-budget-${monthLabel.replace(/\s/g, "-")}.pdf`);
}