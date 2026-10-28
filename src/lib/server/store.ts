/** Excel-backed storage (port of bom_store.py + erp_soh.py file I/O). Same files, same layout. */
import { BOM_COLUMNS, COL_FG_CODE, COL_PM_CODE, COL_ROW_ID } from "../config";
import { diff, normalize, normalizeRows, toRecord } from "../bom/core";
import { pyStr } from "../num";
import type { BomRow, HistoryRow, SohData, SohItem, Table } from "../types";
import { readWorkbook as readXlsx, workbookBuffer, type SheetSpec } from "./xlsx";
import { copyFile, fileExists, fileVersion, readFile, removeFile, writeFile } from "./files";

export { DATA_DIR } from "./files";
// storage keys (relative to the data folder / blob store)
export const BACKUP_DIR = "backups";
export const MASTER_FILE = "BOM_Master.xlsx";
export const DRAFT_FILE = "BOM_Draft.xlsx";
export const HISTORY_FILE = "BOM_History.xlsx";
export const SOH_FILE = "SOH_Cache.xlsx";

async function readWorkbook(key: string) {
  const buf = await readFile(key);
  if (!buf) throw new Error(`${key} not found`);
  return readXlsx(buf);
}
async function writeWorkbookAtomic(key: string, sheets: SheetSpec[]) {
  await writeFile(key, await workbookBuffer(sheets));
}

export const HISTORY_COLUMNS = ["Change ID", "Timestamp", "Changed By", "Note", "FG Code", "FG Name", "Action",
  "PM Code", "PM Name", "Field", "Old Value", "New Value"];

const pad = (n: number) => String(n).padStart(2, "0");
export function now(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
const compact = (d: Date) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

// ── BOM files ───────────────────────────────────────────────────────────
function bomFromTable(t: Table | undefined): BomRow[] {
  if (!t) return [];
  // read_excel(dtype=str) for code columns and Row ID
  return normalize(t.rows.map((r) => {
    const rec: Record<string, unknown> = { ...r };
    for (const c of [COL_FG_CODE, COL_PM_CODE, COL_ROW_ID]) if (typeof rec[c] === "number") rec[c] = pyStr(rec[c]);
    return rec;
  }));
}

async function writeBom(rows: BomRow[], file: string, meta?: Record<string, string>) {
  const cols = [...BOM_COLUMNS, COL_ROW_ID];
  await writeWorkbookAtomic(file, [
    { name: "BOM", columns: cols, rows: rows.map((r) => toRecord(r) as Record<string, string | number | null>), widths: [16, 45, 14, 50, 8, 8, 8, 12], freezeHeader: true },
    ...(meta ? [{ name: "_meta", columns: ["key", "value"], rows: Object.entries(meta).map(([key, value]) => ({ key, value })) }] : []),
  ]);
}

export const masterVersion = () => fileVersion(MASTER_FILE);
export const sohVersion = () => fileVersion(SOH_FILE);

export async function loadMaster(): Promise<BomRow[]> {
  if (!(await fileExists(MASTER_FILE))) return [];
  return bomFromTable((await readWorkbook(MASTER_FILE)).get("BOM"));
}

/** FG code -> Category, read straight from the master's optional "Category" column (display/filter only). */
export async function loadCategories(): Promise<Record<string, string>> {
  if (!(await fileExists(MASTER_FILE))) return {};
  const t = (await readWorkbook(MASTER_FILE)).get("BOM");
  const col = t?.columns.find((c) => c.trim().toLowerCase() === "category");
  if (!t || !col) return {};
  const out: Record<string, string> = {};
  for (const r of t.rows) {
    const fg = r[COL_FG_CODE] === null || r[COL_FG_CODE] === undefined ? "" : pyStr(r[COL_FG_CODE]).replaceAll("\u00a0", "").trim().toUpperCase();
    const cat = r[col] === null || r[col] === undefined ? "" : pyStr(r[col]).trim();
    if (fg && cat && !out[fg]) out[fg] = cat;
  }
  return out;
}

export const hasDraft = () => fileExists(DRAFT_FILE);

/** Draft if one exists, else a fresh copy of master. */
export async function loadDraft(): Promise<BomRow[]> {
  if (await hasDraft()) return bomFromTable((await readWorkbook(DRAFT_FILE)).get("BOM"));
  return loadMaster();
}

export async function draftMeta(): Promise<Record<string, string>> {
  if (!(await hasDraft())) return {};
  try {
    const m = (await readWorkbook(DRAFT_FILE)).get("_meta");
    if (!m) return {};
    return Object.fromEntries(m.rows.map((r) => [pyStr(r.key ?? ""), r.value === null ? "" : pyStr(r.value)]));
  } catch {
    return {};
  }
}

export async function saveDraft(rows: BomRow[], user: string) {
  const meta = await draftMeta();
  meta.base_master_version ??= await masterVersion();
  meta.started_by ??= user;
  meta.started_at ??= now();
  meta.last_edited_by = user;
  meta.last_edited_at = now();
  await writeBom(normalizeRows(rows), DRAFT_FILE, meta);
}

export async function discardDraft() {
  await removeFile(DRAFT_FILE);
}

// ── History & publish ───────────────────────────────────────────────────
export async function loadHistory(): Promise<HistoryRow[]> {
  if (!(await fileExists(HISTORY_FILE))) return [];
  const [t] = [...(await readWorkbook(HISTORY_FILE)).values()];
  if (!t) return [];
  return t.rows.map((r) => Object.fromEntries(t.columns.map((c) => [c, r[c] === null || r[c] === undefined ? "" : pyStr(r[c])])));
}

/** Draft -> master. Backs up old master, logs every change. Returns [#changes, backup path]. */
export async function publish(user: string, note = ""): Promise<[number, string]> {
  if (!(await hasDraft())) return [0, ""];
  const [old, next] = [await loadMaster(), await loadDraft()];
  const changes = diff(old, next);
  if (!changes.length) {
    await discardDraft();
    return [0, ""];
  }
  const ts = new Date();
  let backup = "";
  if (await fileExists(MASTER_FILE)) {
    backup = `${BACKUP_DIR}/BOM_Master_${compact(ts)}.xlsx`;
    await copyFile(MASTER_FILE, backup);
  }
  await writeBom(next, MASTER_FILE);
  const changeId = `CHG-${compact(ts).replace("_", "")}`;
  const stamped = changes.map((c) => ({ "Change ID": changeId, Timestamp: now(ts), "Changed By": user, Note: note, ...c }));
  const hist = [...(await loadHistory()), ...stamped];
  const cols = [...new Set([...HISTORY_COLUMNS, ...hist.flatMap((h) => Object.keys(h))])];
  await writeWorkbookAtomic(HISTORY_FILE, [{ name: "Sheet1", columns: cols, rows: hist }]);
  await discardDraft();
  return [changes.length, backup];
}

// ── SOH cache ───────────────────────────────────────────────────────────
export async function loadSoh(): Promise<SohData> {
  if (!(await fileExists(SOH_FILE))) return { items: [], whCols: [], hasNameCol: false, meta: {} };
  const wb = await readWorkbook(SOH_FILE);
  const t = wb.get("SOH") ?? { columns: [], rows: [] };
  const m = wb.get("_meta");
  const whCols = t.columns.filter((c) => c !== "Item Code" && c !== "ERP Item Name" && c !== "SOH Total");
  const num = (v: unknown) => (typeof v === "number" ? v : v === null || v === undefined ? null : Number.isNaN(Number(v)) ? null : Number(v));
  const items: SohItem[] = t.rows.map((r) => ({
    itemCode: r["Item Code"] === null ? "" : pyStr(r["Item Code"]),
    erpName: r["ERP Item Name"] === null || r["ERP Item Name"] === undefined ? null : pyStr(r["ERP Item Name"]),
    wh: Object.fromEntries(whCols.map((c) => [c, num(r[c])])),
    total: num(r["SOH Total"]),
  }));
  const meta = m ? Object.fromEntries(m.rows.map((r) => [pyStr(r.key ?? ""), r.value === null ? "" : pyStr(r.value)])) : {};
  return { items, whCols, hasNameCol: t.columns.includes("ERP Item Name"), meta };
}

export async function saveSoh(data: { items: SohItem[]; whCols: string[]; hasNameCol: boolean }, source: string) {
  const cols = ["Item Code", ...data.whCols, ...(data.hasNameCol ? ["ERP Item Name"] : []), "SOH Total"]; // same order as pandas agg output
  await writeWorkbookAtomic(SOH_FILE, [
    {
      name: "SOH", columns: cols,
      rows: data.items.map((i) => ({ "Item Code": i.itemCode, "ERP Item Name": i.erpName, ...i.wh, "SOH Total": i.total })),
    },
    { name: "_meta", columns: ["key", "value"], rows: [{ key: "fetched_at", value: now() }, { key: "source", value: source }] },
  ]);
}
