import ExcelJS from "exceljs";
import fs from "node:fs";
import type { Cell, Table } from "../types";

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString().replace("T", " ").slice(0, 19);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return cellValue(v.result as ExcelJS.CellValue);
    if ("text" in v) return String((v as { text: unknown }).text);
    if ("error" in v) return null;
  }
  return String(v);
}

function sheetToTable(ws: ExcelJS.Worksheet): Table {
  const header = ws.getRow(1);
  const columns: string[] = [];
  const idx: number[] = [];
  header.eachCell({ includeEmpty: false }, (c, col) => {
    const name = cellValue(c.value);
    columns.push(name === null ? `Unnamed: ${col - 1}` : String(name));
    idx.push(col);
  });
  const rows: Record<string, Cell>[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rec: Record<string, Cell> = {};
    let any = false;
    idx.forEach((col, i) => {
      let v = cellValue(row.getCell(col).value);
      if (v === "") v = null; // pandas reads blank cells as NaN
      if (v !== null) any = true;
      rec[columns[i]] = v;
    });
    if (any) rows.push(rec);
  }
  return { columns, rows };
}

export async function readWorkbook(src: string | Buffer | ArrayBuffer): Promise<Map<string, Table>> {
  const wb = new ExcelJS.Workbook();
  if (typeof src === "string") await wb.xlsx.readFile(src);
  else await wb.xlsx.load(src as ArrayBuffer);
  const out = new Map<string, Table>();
  wb.eachSheet((ws) => out.set(ws.name, sheetToTable(ws)));
  return out;
}

export interface SheetSpec {
  name: string;
  columns: string[];
  rows: Record<string, Cell | undefined>[];
  widths?: number[];
  freezeHeader?: boolean;
}

export async function workbookBuffer(sheets: SheetSpec[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31), s.freezeHeader ? { views: [{ state: "frozen", ySplit: 1 }] } : undefined);
    ws.addRow(s.columns).font = { bold: true };
    for (const r of s.rows) ws.addRow(s.columns.map((c) => (r[c] === undefined ? null : r[c])));
    s.widths?.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Write via temp file + rename so readers never see a half-written file. */
export async function writeWorkbookAtomic(path: string, sheets: SheetSpec[]) {
  const tmp = `${path}.tmp.xlsx`;
  fs.writeFileSync(tmp, await workbookBuffer(sheets));
  fs.renameSync(tmp, path);
}
