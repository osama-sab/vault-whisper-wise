import jsPDF from "jspdf";
import autoTable, { type RowInput, type Styles, type UserOptions } from "jspdf-autotable";
import type { Category, Transaction, Subscription, ProfileFilter, ProfileId } from "./types";
import { formatMoney, formatDate, profileLabel, monthKey } from "./format";
import { downloadFile, exportTransactionsCSV } from "./csv";
import { brandTones, findMerchant } from "./merchants";
import { buildLedger, filterByProfile, type MonthLedgerRow } from "./budget";
import { buildXLSX, type Sheet } from "./xlsx";

// ─── PALETTE ───────────────────────────────────────────
// Restrained on purpose. Row fills carry no meaning — direction is shown in
// the Type column and in the sign and colour of the amount. The old report
// filled every income row solid green and every odd expense row light red,
// which turned most of the table pink for no reason at all.
const INK = [23, 37, 36] as const;
const TEAL = [15, 118, 110] as const;
const CREDIT = [6, 118, 71] as const;
const DEBIT = [180, 35, 24] as const;
const MUTED = [100, 116, 115] as const;
const ZEBRA = [246, 248, 248] as const;
const RULE = [219, 229, 228] as const;
const BANNER = [232, 240, 239] as const;

/** autoTable needs a mutable 3-tuple; spreading a readonly const gives number[]. */
const rgb = (c: readonly [number, number, number]): [number, number, number] => [c[0], c[1], c[2]];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const FOOTER_Y = PAGE_H - 10;
const BOTTOM_LIMIT = PAGE_H - 20;

export interface ExportOptions {
  months: Date[];
  transactions: Transaction[];
  categories: Category[];
  subscriptions: Subscription[];
  discreet: boolean;
  profile: ProfileFilter;
  currency: string;
  /** Opening balance per profile; combined is the sum of the two. */
  openingBalances: Record<ProfileId, number>;
  formats: ("pdf" | "csv" | "xlsx")[];
  fileStem: string;
  periodLabel: string;
}

export async function exportReport(opts: ExportOptions) {
  if (opts.formats.includes("pdf")) await generatePDF(opts);
  if (opts.formats.includes("csv")) await generateCSV(opts);
  if (opts.formats.includes("xlsx")) await generateXLSX(opts);
}

// ─── SHARED SHAPING ────────────────────────────────────

/** A transaction is hidden if the report is discreet OR the row is vague. */
function isHidden(t: Transaction, discreet: boolean): boolean {
  // t.isVague was previously ignored by both exporters, so rows deliberately
  // marked vague were printed in full.
  return discreet || t.isVague;
}

function payeeOf(t: Transaction, cat: Category | undefined, hide: boolean): string {
  if (hide) return t.displayDescription || cat?.genericLabel || cat?.name || "Personal";
  const merchant = findMerchant(t.payee);
  return merchant ? merchant.label : (t.payee || t.description || "—");
}

function descriptionOf(t: Transaction, hide: boolean): string {
  // A vague transaction carries no description — that is the point of marking
  // it vague. It still gets an em dash rather than an empty cell: blank reads
  // as "the report failed to fill this in", and every other absent value in
  // the document already says "—".
  return hide ? "\u2014" : (t.description || "\u2014");
}

function openingFor(profile: ProfileFilter, balances: Record<ProfileId, number>): number {
  if (profile === "combined") return balances.household + balances.personal;
  return balances[profile];
}

interface ReportModel {
  combined: MonthLedgerRow[];
  household: MonthLedgerRow[] | null;
  personal: MonthLedgerRow[] | null;
}

/**
 * Build the ledgers up front.
 *
 * Months with no transactions are dropped, so a yearly export no longer emits
 * blank pages for months that have not happened yet.
 */
function buildModel(opts: ExportOptions): ReportModel {
  const { months, transactions, categories, subscriptions, profile, openingBalances } = opts;

  const scopedTx = filterByProfile(transactions, profile);
  const scopedSubs = filterByProfile(subscriptions, profile);

  const keep = months.filter((m) => scopedTx.some((t) => t.date.startsWith(monthKey(m))));
  // Always render at least the requested month, even when it is empty.
  const useMonths = keep.length ? keep : months.slice(0, 1);

  const combined = buildLedger(useMonths, scopedTx, categories, scopedSubs, openingFor(profile, openingBalances));

  if (profile !== "combined") {
    return { combined, household: null, personal: null };
  }
  return {
    combined,
    household: buildLedger(useMonths, filterByProfile(transactions, "household"), categories,
      filterByProfile(subscriptions, "household"), openingBalances.household),
    personal: buildLedger(useMonths, filterByProfile(transactions, "personal"), categories,
      filterByProfile(subscriptions, "personal"), openingBalances.personal),
  };
}

// ─── PDF LAYOUT HELPERS ────────────────────────────────

function lastY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? MARGIN;
}

/**
 * Place a section heading, moving to a new page when there is no room for the
 * heading AND a meaningful amount of what follows.
 *
 * The old helper compared a hardcoded number against a hard limit and could
 * still orphan a heading at the foot of a page.
 */
function heading(doc: jsPDF, text: string, y: number, needed = 26): number {
  let top = y;
  if (top + needed > BOTTOM_LIMIT) {
    doc.addPage();
    top = MARGIN + 6;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(text, MARGIN, top);
  doc.setFont("helvetica", "normal");
  return top + 3;
}

// ─── VERTICAL RHYTHM ───────────────────────────────────
// Named so section spacing is consistent, instead of the scatter of
// +1 / +6 / +7 / +8 / +10 magic numbers this file used to carry.
const GAP_AFTER_MONTH_TITLE = 6;
const GAP_BEFORE_HEADING = 8;
const GAP_AFTER_HEADING = 1;
const GAP_BETWEEN_SECTIONS = 10;

const baseTable = {
  // `top` applies to pages a table spills onto (startY governs the first),
  // leaving room for the "(continued)" running header drawn in the footer pass.
  margin: { left: MARGIN, right: MARGIN, top: 22 },
  headStyles: { fillColor: rgb(TEAL), textColor: 255, fontStyle: "bold" as const, fontSize: 8 },
  // No cell borders: zebra banding and the header fill carry the structure,
  // which reads like a financial statement rather than a spreadsheet grid.
  bodyStyles: { fontSize: 8, textColor: rgb(INK), lineWidth: 0 },
  alternateRowStyles: { fillColor: rgb(ZEBRA) },
  styles: { cellPadding: 1.8, overflow: "linebreak" as const, lineColor: rgb(RULE) },
};

export type Align = "left" | "right" | "center";

export interface ColSpec {
  header: string;
  align?: Align;
  width?: number;
  padding?: { top: number; bottom: number; left: number; right: number };
}

/**
 * Build autoTable options from a column spec.
 *
 * jspdf-autotable v5 applies `columnStyles` to BODY cells only — see
 * `dist/jspdf.plugin.autotable.js`: `sectionName === 'body' ? columnStyles : {}`.
 * So a right-aligned numeric column gets a LEFT-aligned header unless the
 * alignment is reapplied to the head and foot explicitly. Routing every table
 * through this helper is what stops the two drifting apart again.
 */
export function tableFor(cols: ColSpec[], body: RowInput[], extra: Partial<UserOptions> = {}): UserOptions {
  const columnStyles: Record<number, Partial<Styles>> = {};
  cols.forEach((c, i) => {
    const s: Partial<Styles> = {};
    if (c.align) s.halign = c.align;
    if (c.width) s.cellWidth = c.width;
    if (c.padding) s.cellPadding = c.padding;
    if (Object.keys(s).length) columnStyles[i] = s;
  });

  const { didParseCell, ...rest } = extra;

  return {
    ...baseTable,
    head: [cols.map((c) => c.header)],
    body,
    columnStyles,
    ...rest,
    didParseCell(data) {
      if (data.section !== "body") {
        const align = cols[data.column.index]?.align;
        // A colSpan cell reports its first column's index and carries its own
        // alignment in the cell definition, so leave those to the caller.
        if (align && data.cell.colSpan === 1) data.cell.styles.halign = align;
      }
      didParseCell?.(data);
    },
  };
}

/** Index of a column by its header, so hooks survive a column being dropped. */
const colIndex = (cols: ColSpec[], header: string) => cols.findIndex((c) => c.header === header);

function money(n: number, currency: string) {
  return formatMoney(n, currency);
}


// ─── PDF ───────────────────────────────────────────────

async function generatePDF(opts: ExportOptions) {
  const { categories, discreet, profile, currency, periodLabel } = opts;
  const doc = new jsPDF();
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const model = buildModel(opts);
  const isCombined = profile === "combined";

  // ── Header band ──
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, PAGE_W, 34, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text("Pocket Money", MARGIN, 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(periodLabel, MARGIN, 23);
  doc.setFontSize(8.5);
  doc.text(`${profileLabel(profile)}${discreet ? "  ·  Discreet mode" : ""}`, PAGE_W - MARGIN, 23, { align: "right" });
  doc.setFontSize(7.5);
  doc.text(
    `Generated ${new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}`,
    PAGE_W - MARGIN, 29, { align: "right" }
  );
  doc.setTextColor(...INK);

  let cursor = 44;

  // A long month breaks across pages, and a continuation page used to open on
  // a bare table with nothing saying which month it belonged to. Record the
  // span each month covers so those pages can be labelled in the footer pass.
  const continuationOf = new Map<number, string>();

  model.combined.forEach((row, mi) => {
    const monthName = row.month.toLocaleDateString(undefined, { month: "long", year: "numeric" });

    if (mi > 0) {
      doc.addPage();
      cursor = MARGIN + 6;
    }
    const firstPage = doc.getNumberOfPages();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...INK);
    doc.text(monthName, MARGIN, cursor);
    doc.setFont("helvetica", "normal");
    cursor += GAP_AFTER_MONTH_TITLE;

    const sub = isCombined
      ? [
        { label: "Household", row: model.household![mi] },
        { label: "Personal", row: model.personal![mi] },
      ]
      : [];

    cursor = balanceTable(doc, cursor, row, sub, currency, isCombined);

    // ── Category breakdown ──
    const catRows = [...row.recon.byCategory.entries()]
      .map(([id, t]) => ({ c: catMap.get(id)!, credit: t.credit, debit: t.debit }))
      .filter((r) => r.c)
      // Grouped by type, biggest line first within each group.
      .sort((a, b) =>
        a.c.type.localeCompare(b.c.type) ||
        (b.debit + b.credit) - (a.debit + a.credit) ||
        a.c.name.localeCompare(b.c.name)
      );

    if (catRows.length) {
      cursor = heading(doc, "Category breakdown", cursor + GAP_BEFORE_HEADING);

      // The Profile column says the same thing on every row of a single-profile
      // report, so it only earns its width when both profiles are present.
      const cols: ColSpec[] = [
        { header: "Category" },
        ...(isCombined ? [{ header: "Profile", width: 22 } as ColSpec] : []),
        { header: "Credit", align: "right" },
        { header: "Debit", align: "right" },
        { header: "Monthly limit", align: "right" },
        { header: "Over / under", align: "right" },
      ];
      const iCredit = colIndex(cols, "Credit");
      const iDebit = colIndex(cols, "Debit");
      const iVar = colIndex(cols, "Over / under");

      const body: RowInput[] = [];
      const meta: ({ credit: number; debit: number; over: boolean } | null)[] = [];
      let lastType = "";

      for (const r of catRows) {
        if (r.c.type !== lastType) {
          lastType = r.c.type;
          // A real colSpan row. The old report painted a grey rectangle above
          // the first body row, which landed on top of the column header.
          body.push([{
            content: profileLabel(r.c.type),
            colSpan: cols.length,
            styles: { fillColor: rgb(BANNER), textColor: rgb(TEAL), fontStyle: "bold", fontSize: 8, halign: "left" },
          }]);
          meta.push(null);
        }
        const hasBudget = r.c.monthlyBudget > 0;
        const variance = r.debit - r.c.monthlyBudget;
        // Within a cent of the budget is "on budget" — a signed "- 0,00 €" is
        // just noise, and float drift makes an exact zero unreliable anyway.
        const onBudget = Math.abs(variance) < 0.005;
        const over = hasBudget && variance > 0 && !onBudget;
        body.push([
          r.c.name,
          ...(isCombined ? [profileLabel(r.c.profileDefault)] : []),
          r.credit > 0 ? `+ ${money(r.credit, currency)}` : "—",
          r.debit > 0 ? `- ${money(r.debit, currency)}` : "—",
          hasBudget ? money(r.c.monthlyBudget, currency) : "—",
          // A signed figure in a numeric column, rather than a word glued to a
          // number, which never sat right against a right-aligned edge.
          !hasBudget ? "—" : onBudget ? "on budget" : `${over ? "+" : "-"} ${money(Math.abs(variance), currency)}`,
        ]);
        meta.push({ credit: r.credit, debit: r.debit, over });
      }

      autoTable(doc, tableFor(cols, body, {
        startY: cursor + GAP_AFTER_HEADING,
        didParseCell(data) {
          if (data.section !== "body") return;
          const m = meta[data.row.index];
          if (!m) return;
          if (data.column.index === iCredit && m.credit > 0) data.cell.styles.textColor = rgb(CREDIT);
          if (data.column.index === iDebit && m.debit > 0) data.cell.styles.textColor = rgb(DEBIT);
          if (data.column.index === iVar) data.cell.styles.textColor = m.over ? rgb(DEBIT) : rgb(MUTED);
        },
      }));
      cursor = lastY(doc);
    }

    // ── Transaction detail ──
    if (row.transactions.length) {
      cursor = heading(doc, "Transactions", cursor + GAP_BEFORE_HEADING, 34);

      const detail = row.transactions.map((t) => {
        const c = catMap.get(t.categoryId);
        const isIncome = c?.type === "income";
        const hide = isHidden(t, discreet);
        return {
          isIncome,
          // Carried so the Payee column can be marked. A vague row
          // deliberately shows no merchant identity at all.
          merchant: hide ? null : findMerchant(t.payee),
          // The initial to fall back on when the payee is not a merchant we
          // know, so every visible row gets the same shaped mark.
          initial: hide ? "" : (t.payee || t.description || "").trim().charAt(0).toUpperCase(),
          cells: [
            formatDate(t.date, { day: "2-digit", month: "short" }),
            isIncome ? "Credit" : "Debit",
            payeeOf(t, c, hide),
            c?.name || "—",
            ...(isCombined ? [profileLabel(t.profile)] : []),
            descriptionOf(t, hide),
            // ASCII minus, not U+2212: jsPDF's standard Helvetica encodes
            // WinAnsi only, and the typographic minus renders as a stray quote.
            `${isIncome ? "+" : "-"} ${money(Math.abs(t.amount), currency)}`,
          ],
        };
      });

      const cols: ColSpec[] = [
        { header: "Date", width: 15 },
        { header: "Type", width: 13 },
        // Left padding leaves room for the merchant chip drawn below.
        { header: "Payee", width: 36, padding: { top: 1.8, bottom: 1.8, left: 6.4, right: 1.8 } },
        { header: "Category", width: 25 },
        ...(isCombined ? [{ header: "Profile", width: 18 } as ColSpec] : []),
        { header: "Description" },
        { header: "Amount", width: 25, align: "right" },
      ];
      const iType = colIndex(cols, "Type");
      const iAmount = colIndex(cols, "Amount");
      const iPayee = colIndex(cols, "Payee");

      autoTable(doc, tableFor(cols, detail.map((d) => d.cells), {
        startY: cursor + GAP_AFTER_HEADING,
        bodyStyles: { ...baseTable.bodyStyles, fontSize: 7 },
        didParseCell(data) {
          if (data.section !== "body") return;
          const d = detail[data.row.index];
          if (!d) return;
          if (data.column.index === iType || data.column.index === iAmount) {
            data.cell.styles.textColor = d.isIncome ? rgb(CREDIT) : rgb(DEBIT);
            data.cell.styles.fontStyle = "bold";
          }
        },
        // The same monogram chip the app draws beside a payee.
        //
        // This was a bare 2mm colour swatch, which read as a logo that had
        // failed to load — a coloured box next to "OBI" says nothing about
        // OBI. A tinted tile carrying the merchant's initials is the app's own
        // mark, and it is legible in one ink on paper.
        didDrawCell(data) {
          if (data.section !== "body" || data.column.index !== iPayee) return;
          const d = detail[data.row.index];
          if (!d || (!d.merchant && !d.initial)) return;

          const SIZE = 4;
          const x = data.cell.x + 1.3;
          const y = data.cell.y + data.cell.height / 2 - SIZE / 2;

          const tones = d.merchant ? brandTones(d.merchant.color) : null;
          const [bgR, bgG, bgB] = tones ? tones.bgPrint : [237, 240, 241];
          const [fgR, fgG, fgB] = tones ? tones.fgPrint : [90, 100, 104];
          const label = d.merchant ? d.merchant.abbrev : d.initial;

          doc.setFillColor(bgR, bgG, bgB);
          doc.roundedRect(x, y, SIZE, SIZE, 1.1, 1.1, "F");

          // Saved and restored: autoTable draws the rest of the row with
          // whatever state it finds, so leaking a 4pt bold brand colour into
          // the next cell would repaint half the table.
          const prevSize = doc.getFontSize();
          doc.setFontSize(label.length > 2 ? 3.4 : 4.2);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(fgR, fgG, fgB);
          doc.text(label, x + SIZE / 2, y + SIZE / 2, { align: "center", baseline: "middle" });
          doc.setFontSize(prevSize);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(0, 0, 0);
        },
        // The running balance belongs with the detail it explains, so it is a
        // real footer row. The old version printed it as loose text and threw
        // it away whenever the table ended low on the page.
        //
        // It is the MONTH's balance, not a per-page subtotal, so it prints once
        // at the very end — repeating it made page 1 look like it closed on the
        // month's final figure. Closing spans the last two columns so the label
        // and the amount stay on one line.
        showFoot: "lastPage",
        foot: [[
          { content: `Opening  ${money(row.opening, currency)}`, colSpan: Math.max(1, iAmount - 1) },
          {
            content: `Closing  ${money(row.closing, currency)}`,
            colSpan: cols.length - Math.max(1, iAmount - 1),
            styles: { halign: "right" },
          },
        ]],
        footStyles: {
          fillColor: rgb(BANNER), textColor: rgb(INK),
          fontStyle: "bold", fontSize: 8, halign: "left",
        },
      }));
      cursor = lastY(doc);
    }

    for (let p = firstPage + 1; p <= doc.getNumberOfPages(); p++) continuationOf.set(p, monthName);
  });

  // ── Subscriptions: once, at the end, not reprinted on every month page ──
  const activeSubs = filterByProfile(opts.subscriptions, profile).filter((s) => s.active);
  if (activeSubs.length) {
    const lastRow = model.combined[model.combined.length - 1];
    const settled = new Set(lastRow.recon.fulfilled.map((s) => s.id));
    let y = heading(doc, "Recurring subscriptions", lastY(doc) + GAP_BETWEEN_SECTIONS, 36);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(
      `Status shown for ${lastRow.month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}.`,
      MARGIN, y + 4
    );
    doc.setTextColor(...INK);
    y += 6;

    const cols: ColSpec[] = [
      { header: "Subscription" },
      { header: "Due", width: 18 },
      { header: "Category" },
      ...(isCombined ? [{ header: "Profile", width: 22 } as ColSpec] : []),
      { header: "Status", width: 20 },
      { header: "Expected", width: 26, align: "right" },
    ];
    const iStatus = colIndex(cols, "Status");

    autoTable(doc, tableFor(cols, activeSubs.map((s) => [
      s.name,
      `Day ${s.dueDay}`,
      catMap.get(s.categoryId)?.name || "—",
      ...(isCombined ? [profileLabel(s.profile)] : []),
      settled.has(s.id) ? "Paid" : "Due",
      money(s.expectedAmount, currency),
    ]), {
      startY: y,
      didParseCell(data) {
        if (data.section !== "body" || data.column.index !== iStatus) return;
        data.cell.styles.textColor = data.cell.text[0] === "Paid" ? rgb(CREDIT) : rgb(MUTED);
      },
    }));
  }

  // ── Footers ──
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);

    const carried = continuationOf.get(i);
    if (carried) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text(`${carried} (continued)`, MARGIN, 17);
      doc.setFont("helvetica", "normal");
    }

    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.setDrawColor(...RULE);
    doc.line(MARGIN, FOOTER_Y - 4, PAGE_W - MARGIN, FOOTER_Y - 4);
    doc.text(`Pocket Money · ${periodLabel} · ${profileLabel(profile)}`, MARGIN, FOOTER_Y);
    doc.text(`Page ${i} of ${pages}`, PAGE_W - MARGIN, FOOTER_Y, { align: "right" });
  }

  await downloadFile(`${opts.fileStem}.pdf`, doc.output("blob"), "application/pdf");
}

/** Opening / credits / debits / still expected / closing, with a per-profile split. */
function balanceTable(
  doc: jsPDF,
  y: number,
  row: MonthLedgerRow,
  sub: { label: string; row: MonthLedgerRow }[],
  currency: string,
  isCombined: boolean
): number {
  // The corner cell used to be blank, which read as unfinished. Naming the
  // period there turns dead space into the one label the table was missing.
  const corner = row.month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const cols: ColSpec[] = isCombined
    ? [
      { header: corner, width: 50 },
      { header: "Combined", align: "right" },
      ...sub.map((s) => ({ header: s.label, align: "right" as Align })),
    ]
    : [{ header: corner, width: 50 }, { header: "Amount", align: "right" }];

  const line = (label: string, pick: (r: MonthLedgerRow) => number) =>
    isCombined
      ? [label, money(pick(row), currency), ...sub.map((s) => money(pick(s.row), currency))]
      : [label, money(pick(row), currency)];

  const body = [
    line("Opening balance", (r) => r.opening),
    line("Credits in", (r) => r.recon.credit),
    line("Debits out", (r) => r.recon.debit),
    line("Bills still expected", (r) => r.recon.stillExpected),
    line("Closing balance", (r) => r.closing),
  ];

  autoTable(doc, tableFor(cols, body, {
    startY: y,
    alternateRowStyles: {},
    didParseCell(data) {
      if (data.section !== "body") return;
      const r = data.row.index;
      if (r === 0 || r === 4) data.cell.styles.fontStyle = "bold";
      if (r === 4) data.cell.styles.fillColor = rgb(BANNER);
      if (data.column.index === 0) return;
      if (r === 1) data.cell.styles.textColor = rgb(CREDIT);
      if (r === 2 || r === 3) data.cell.styles.textColor = rgb(DEBIT);
      if (r === 4) {
        const value = data.column.index === 1 ? row.closing : (sub[data.column.index - 2]?.row.closing ?? 0);
        data.cell.styles.textColor = value >= 0 ? rgb(CREDIT) : rgb(DEBIT);
      }
    },
  }));
  return lastY(doc);
}

// ─── TABULAR DATA (CSV and XLSX share the same shaping) ──

function transactionRows(opts: ExportOptions, model: ReportModel) {
  const catMap = new Map(opts.categories.map((c) => [c.id, c]));
  return model.combined.flatMap((row) =>
    row.transactions.map((t) => {
      const c = catMap.get(t.categoryId);
      const isIncome = c?.type === "income";
      const hide = isHidden(t, opts.discreet);
      return {
        Date: t.date,
        Month: monthKey(row.month),
        Type: isIncome ? "Credit" : "Debit",
        Profile: profileLabel(t.profile),
        Category: c?.name || "",
        "Category type": profileLabel(c?.type || ""),
        Payee: hide ? "" : payeeOf(t, c, false),
        Description: hide ? (t.displayDescription || c?.genericLabel || "") : (t.description || ""),
        Amount: isIncome ? Math.abs(t.amount) : -Math.abs(t.amount),
      };
    })
  );
}

/** The category summary a flat transaction list cannot give you. */
function categoryRows(opts: ExportOptions, model: ReportModel) {
  const catMap = new Map(opts.categories.map((c) => [c.id, c]));
  return model.combined.flatMap((row) =>
    [...row.recon.byCategory.entries()].map(([id, t]) => {
      const c = catMap.get(id);
      return {
        Month: monthKey(row.month),
        Category: c?.name || "",
        Type: profileLabel(c?.type || ""),
        Profile: profileLabel(c?.profileDefault || ""),
        Credit: t.credit,
        Debit: t.debit,
        Budget: c?.monthlyBudget ?? 0,
        "Over budget by": c && c.monthlyBudget > 0 ? Math.max(0, t.debit - c.monthlyBudget) : 0,
      };
    })
  );
}

function balanceRows(model: ReportModel) {
  return model.combined.map((row, i) => ({
    Month: monthKey(row.month),
    Opening: row.opening,
    Credits: row.recon.credit,
    Debits: row.recon.debit,
    "Still expected": row.recon.stillExpected,
    Closing: row.closing,
    "Household closing": model.household ? model.household[i].closing : "",
    "Personal closing": model.personal ? model.personal[i].closing : "",
  }));
}

async function generateCSV(opts: ExportOptions) {
  const model = buildModel(opts);
  // Three files, because a flat transaction list cannot answer "what did each
  // category cost this month" — which is what a spreadsheet is actually for.
  await downloadFile(`${opts.fileStem}-transactions.csv`, exportTransactionsCSV(transactionRows(opts, model)));
  await downloadFile(`${opts.fileStem}-categories.csv`, exportTransactionsCSV(categoryRows(opts, model)));
  await downloadFile(`${opts.fileStem}-balances.csv`, exportTransactionsCSV(balanceRows(model)));
}

async function generateXLSX(opts: ExportOptions) {
  const model = buildModel(opts);
  const sheet = (name: string, rows: Record<string, unknown>[]): Sheet => {
    if (!rows.length) return { name, rows: [["No data"]] };
    const headers = Object.keys(rows[0]);
    return { name, rows: [headers, ...rows.map((r) => headers.map((h) => r[h] as string | number))] };
  };
  await downloadFile(
    `${opts.fileStem}.xlsx`,
    buildXLSX([
      sheet("Balances", balanceRows(model)),
      sheet("Categories", categoryRows(opts, model)),
      sheet("Transactions", transactionRows(opts, model)),
    ]),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}
