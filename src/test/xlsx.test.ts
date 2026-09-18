import { describe, it, expect } from "vitest";
import { buildXLSX } from "@/lib/xlsx";
import { unzipSync, strFromU8 } from "fflate";

async function parts(blob: Blob): Promise<Record<string, string>> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const files = unzipSync(bytes);
  const out: Record<string, string> = {};
  for (const [name, data] of Object.entries(files)) out[name] = strFromU8(data);
  return out;
}

describe("buildXLSX", () => {
  it("produces a ZIP a real unzipper can read", async () => {
    const blob = buildXLSX([{ name: "Summary", rows: [["Category", "Amount"], ["Groceries", 412.5]] }]);
    const p = await parts(blob);
    expect(Object.keys(p).sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
  });

  it("writes numbers as numbers and text as inline strings", async () => {
    const p = await parts(buildXLSX([{ name: "S", rows: [["Category", "Amount"], ["Groceries", 412.5]] }]));
    const sheet = p["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain("<v>412.5</v>");
    expect(sheet).toContain("<t xml:space=\"preserve\">Groceries</t>");
  });

  it("escapes XML metacharacters", async () => {
    const p = await parts(buildXLSX([{ name: "S", rows: [["A"], ["Müller & Co <GmbH>"]] }]));
    expect(p["xl/worksheets/sheet1.xml"]).toContain("Müller &amp; Co &lt;GmbH&gt;");
  });

  it("names every sheet and declares one per tab", async () => {
    const p = await parts(buildXLSX([
      { name: "Summary", rows: [["a"]] },
      { name: "Categories", rows: [["b"]] },
      { name: "Transactions", rows: [["c"]] },
    ]));
    expect(p["xl/workbook.xml"]).toContain('name="Summary"');
    expect(p["xl/workbook.xml"]).toContain('name="Categories"');
    expect(p["xl/workbook.xml"]).toContain('name="Transactions"');
    expect(p["xl/worksheets/sheet3.xml"]).toBeDefined();
  });

  it("sanitises sheet names Excel would reject", async () => {
    const p = await parts(buildXLSX([{ name: "Apr/May [2026]: report that is far too long", rows: [["a"]] }]));
    const m = /name="([^"]*)"/.exec(p["xl/workbook.xml"]);
    expect(m).not.toBeNull();
    expect(m![1].length).toBeLessThanOrEqual(31);
    expect(m![1]).not.toMatch(/[:\\/?*[\]]/);
  });

  it("handles ragged rows and empty cells", async () => {
    const p = await parts(buildXLSX([{ name: "S", rows: [["A", "B", "C"], ["x"], [null, undefined, 3]] }]));
    expect(p["xl/worksheets/sheet1.xml"]).toContain("<v>3</v>");
  });
});
