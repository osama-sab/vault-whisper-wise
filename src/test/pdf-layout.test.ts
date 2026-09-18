import { describe, it, expect, vi } from "vitest";
import { tableFor, type ColSpec } from "@/lib/pdf";
import type { CellHookData } from "jspdf-autotable";

/**
 * Minimal stand-in for the cell object autotable hands to didParseCell.
 * Only the fields the hook touches are modelled.
 */
function cell(section: "head" | "body" | "foot", columnIndex: number, colSpan = 1) {
  const data = {
    section,
    column: { index: columnIndex },
    row: { index: 0 },
    cell: { colSpan, styles: {} as Record<string, unknown>, text: [""] },
  };
  return data as unknown as CellHookData & { cell: { styles: Record<string, unknown> } };
}

const cols: ColSpec[] = [
  { header: "Category" },
  { header: "Credit", align: "right" },
  { header: "Debit", align: "right" },
];

describe("tableFor", () => {
  it("derives the head row from the column spec", () => {
    const o = tableFor(cols, []);
    expect(o.head).toEqual([["Category", "Credit", "Debit"]]);
  });

  it("aligns HEAD cells to match their column", () => {
    // The bug this guards: jspdf-autotable v5 applies columnStyles to body
    // cells only ("sectionName === 'body' ? columnStyles : {}"), so every
    // right-aligned numeric column rendered with a left-aligned header.
    const o = tableFor(cols, []);
    const c = cell("head", 1);
    o.didParseCell!(c);
    expect(c.cell.styles.halign).toBe("right");
  });

  it("aligns FOOT cells to match their column", () => {
    const o = tableFor(cols, []);
    const c = cell("foot", 2);
    o.didParseCell!(c);
    expect(c.cell.styles.halign).toBe("right");
  });

  it("leaves body cells to columnStyles", () => {
    const o = tableFor(cols, []);
    const c = cell("body", 1);
    o.didParseCell!(c);
    expect(c.cell.styles.halign).toBeUndefined();
    expect(o.columnStyles).toMatchObject({ 1: { halign: "right" }, 2: { halign: "right" } });
  });

  it("does not touch a column with no declared alignment", () => {
    const o = tableFor(cols, []);
    const c = cell("head", 0);
    o.didParseCell!(c);
    expect(c.cell.styles.halign).toBeUndefined();
  });

  it("leaves colSpan cells alone so they keep their own alignment", () => {
    // Section banners and the Opening/Closing footer carry alignment in their
    // own cell definition; overriding it from the column spec would fight them.
    const o = tableFor(cols, []);
    const c = cell("foot", 1, 2);
    o.didParseCell!(c);
    expect(c.cell.styles.halign).toBeUndefined();
  });

  it("still calls a caller-supplied didParseCell", () => {
    const spy = vi.fn();
    const o = tableFor(cols, [], { didParseCell: spy });
    o.didParseCell!(cell("body", 0));
    expect(spy).toHaveBeenCalledOnce();
  });

  it("carries width and padding into columnStyles", () => {
    const o = tableFor([{ header: "Payee", width: 33, padding: { top: 1, bottom: 1, left: 4, right: 1 } }], []);
    expect(o.columnStyles).toMatchObject({ 0: { cellWidth: 33, cellPadding: { left: 4 } } });
  });
});
