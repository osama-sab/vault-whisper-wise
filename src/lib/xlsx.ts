/**
 * A minimal .xlsx writer — no dependency.
 *
 * An .xlsx file is a ZIP of XML parts. Everything here is written with the
 * ZIP "stored" method (no compression), which every spreadsheet application
 * accepts and which needs nothing beyond a CRC-32. Values are written as
 * inline strings or numbers, so there is no shared-string table to maintain.
 *
 * This exists because the app advertised an XLSX export it never implemented,
 * and the available npm packages for this are either stale or far heavier than
 * a few hundred rows of budget data warrants.
 */

export type CellValue = string | number | null | undefined;

export interface Sheet {
  name: string;
  /** First row is treated as the header. */
  rows: CellValue[][];
}

// ─── XML ───────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Control characters are not legal in XML 1.0 and Excel rejects the file.
    // eslint-disable-next-line no-control-regex -- matching them is the point
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

/** 1 -> A, 27 -> AA */
function colName(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cellXml(v: CellValue, ref: string, isHeader: boolean): string {
  if (v === null || v === undefined || v === "") return "";
  const style = isHeader ? ' s="1"' : "";
  if (typeof v === "number" && Number.isFinite(v)) {
    return `<c r="${ref}"${style}><v>${v}</v></c>`;
  }
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
}

function sheetXml(sheet: Sheet): string {
  const rows = sheet.rows.map((row, ri) => {
    const cells = row.map((v, ci) => cellXml(v, `${colName(ci + 1)}${ri + 1}`, ri === 0)).join("");
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join("");

  const colCount = Math.max(1, ...sheet.rows.map((r) => r.length));
  // Width roughly to content, capped so a long Verwendungszweck cannot make
  // one column swallow the sheet.
  const widths = Array.from({ length: colCount }, (_, ci) => {
    const longest = Math.max(...sheet.rows.map((r) => String(r[ci] ?? "").length), 8);
    return `<col min="${ci + 1}" max="${ci + 1}" width="${Math.min(46, longest + 3)}" customWidth="1"/>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${widths}</cols><sheetData>${rows}</sheetData></worksheet>`;
}

/** Sheet names may not exceed 31 chars or contain : \ / ? * [ ] */
function safeSheetName(name: string, index: number): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31);
  return cleaned || `Sheet${index + 1}`;
}

function buildParts(sheets: Sheet[]): Record<string, string> {
  const names = sheets.map((s, i) => safeSheetName(s.name, i));

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${
    sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")
  }</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${
    names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")
  }</sheets></workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${
    sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")
  }<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  // Two styles: 0 = default, 1 = bold (used for the header row).
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`;

  const parts: Record<string, string> = {
    "[Content_Types].xml": contentTypes,
    "_rels/.rels": rels,
    "xl/workbook.xml": workbook,
    "xl/_rels/workbook.xml.rels": workbookRels,
    "xl/styles.xml": styles,
  };
  sheets.forEach((s, i) => { parts[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s); });
  return parts;
}

// ─── ZIP ───────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Build a ZIP archive using the "stored" (uncompressed) method. */
function zip(files: Record<string, string>): Blob {
  const encoder = new TextEncoder();
  const entries: { name: Uint8Array; data: Uint8Array; crc: number; offset: number }[] = [];
  const chunks: Uint8Array[] = [];
  let offset = 0;

  const push = (u: Uint8Array) => { chunks.push(u); offset += u.length; };
  const header = (size: number) => {
    const b = new Uint8Array(size);
    return { b, view: new DataView(b.buffer) };
  };

  for (const [path, content] of Object.entries(files)) {
    const name = encoder.encode(path);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const start = offset;

    const { b, view } = header(30);
    view.setUint32(0, 0x04034b50, true); // local file header
    view.setUint16(4, 20, true);         // version needed
    view.setUint16(6, 0x0800, true);     // UTF-8 filenames
    view.setUint16(8, 0, true);          // stored
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, name.length, true);
    push(b); push(name); push(data);

    entries.push({ name, data, crc, offset: start });
  }

  const centralStart = offset;
  for (const e of entries) {
    const { b, view } = header(46);
    view.setUint32(0, 0x02014b50, true); // central directory header
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0x0800, true);
    view.setUint16(10, 0, true);
    view.setUint32(16, e.crc, true);
    view.setUint32(20, e.data.length, true);
    view.setUint32(24, e.data.length, true);
    view.setUint16(28, e.name.length, true);
    view.setUint32(42, e.offset, true);
    push(b); push(e.name);
  }

  const { b: end, view: endView } = header(22);
  endView.setUint32(0, 0x06054b50, true); // end of central directory
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, offset - centralStart, true);
  endView.setUint32(16, centralStart, true);
  push(end);

  return new Blob(chunks as BlobPart[], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Build a workbook with one tab per sheet. */
export function buildXLSX(sheets: Sheet[]): Blob {
  return zip(buildParts(sheets.length ? sheets : [{ name: "Sheet1", rows: [[]] }]));
}
