/**
 * Port of bom_store.py pure logic: clean_code, normalize, replace_fg_in, diff, validate, data_warnings.
 * Behaviour (including ordering and messages) matches the Python implementation.
 */
import {
  BOM_COLUMNS, COL_FG_CODE, COL_FG_NAME, COL_PM_CODE, COL_PM_NAME, COL_QTY, COL_RATE, COL_ROW_ID, COL_UOM,
} from "../config";
import { pyFloatRepr, pyStr, toNumeric } from "../num";
import type { BomRow, DiffRow } from "../types";

const isMissing = (x: unknown) => x === null || x === undefined || (typeof x === "number" && Number.isNaN(x));

export function cleanCode(x: unknown): string {
  if (isMissing(x)) return "";
  return pyStr(x).replaceAll(" ", "").trim().toUpperCase();
}

function textCell(v: unknown): string {
  return isMissing(v) ? "" : pyStr(v).trim();
}

export function newId(): string {
  const b = new Uint8Array(5);
  globalThis.crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export type RawRecord = Record<string, unknown>;

/** BomRow -> record keyed by sheet column names. */
export function toRecord(r: Partial<BomRow>): RawRecord {
  return {
    [COL_FG_CODE]: r.fgCode, [COL_FG_NAME]: r.fgName, [COL_PM_CODE]: r.pmCode, [COL_PM_NAME]: r.pmName,
    [COL_QTY]: r.qty, [COL_UOM]: r.uom, [COL_RATE]: r.rate, [COL_ROW_ID]: r.rowId,
  };
}

/** normalize(): tidy columns/values so comparisons and lookups behave. */
export function normalize(records: RawRecord[]): BomRow[] {
  const out: BomRow[] = [];
  for (const raw of records) {
    const rec: RawRecord = {};
    for (const [k, v] of Object.entries(raw)) rec[String(k).trim()] = v;
    const rid = rec[COL_ROW_ID];
    const row: BomRow = {
      fgCode: cleanCode(rec[COL_FG_CODE]),
      fgName: textCell(rec[COL_FG_NAME]),
      pmCode: cleanCode(rec[COL_PM_CODE]),
      pmName: textCell(rec[COL_PM_NAME]),
      qty: toNumeric(rec[COL_QTY]),
      uom: textCell(rec[COL_UOM]),
      rate: toNumeric(rec[COL_RATE]),
      rowId: typeof rid === "string" && rid ? rid : newId(),
    };
    if (row.fgCode === "" && row.pmCode === "" && row.pmName === "") continue; // drop fully empty lines
    out.push(row);
  }
  return out;
}

export const normalizeRows = (rows: Partial<BomRow>[]) => normalize(rows.map(toRecord));

/** Swap out all lines of one FG (by original code) with edited lines, keeping file order. */
export function replaceFgIn(all: BomRow[], fgCode: string, fgRows: BomRow[]): BomRow[] {
  const code = cleanCode(fgCode);
  const rows = normalizeRows(fgRows);
  const first = all.findIndex((r) => r.fgCode === code);
  if (first >= 0) {
    const before = all.slice(0, first).filter((r) => r.fgCode !== code);
    const after = all.slice(first).filter((r) => r.fgCode !== code);
    return [...before, ...rows, ...after];
  }
  return [...all, ...rows];
}

// ── Diff ────────────────────────────────────────────────────────────────
const TRACKED: [string, keyof BomRow][] = [
  [COL_FG_CODE, "fgCode"], [COL_FG_NAME, "fgName"], [COL_PM_CODE, "pmCode"], [COL_PM_NAME, "pmName"],
  [COL_QTY, "qty"], [COL_UOM, "uom"], [COL_RATE, "rate"],
];

/** _fmt(): '' for missing, ints without '.0', else str(). */
export function fmtVal(v: unknown): string {
  if (isMissing(v)) return "";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return BigInt(v).toString();
    return pyFloatRepr(v);
  }
  return String(v);
}

const pySort = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function diff(old: BomRow[], next: BomRow[]): DiffRow[] {
  const recs: DiffRow[] = [];
  const mk = (fg: string, name: string, action: string, pm: string, pmName: string, field: string, o: string, n: string): DiffRow => ({
    "FG Code": fg, "FG Name": name, Action: action, "PM Code": pm, "PM Name": pmName, Field: field, "Old Value": o, "New Value": n,
  });
  const oldFgs = new Set(old.map((r) => r.fgCode));
  const newFgs = new Set(next.map((r) => r.fgCode));
  for (const fg of [...newFgs].filter((f) => !oldFgs.has(f)).sort(pySort)) {
    const rows = next.filter((r) => r.fgCode === fg);
    recs.push(mk(fg, rows[0].fgName, "New FG", "", "", "", "", `${rows.length} lines`));
  }
  for (const fg of [...oldFgs].filter((f) => !newFgs.has(f)).sort(pySort)) {
    const rows = old.filter((r) => r.fgCode === fg);
    recs.push(mk(fg, rows[0].fgName, "FG removed", "", "", "", `${rows.length} lines`, ""));
  }
  const oMap = new Map(old.map((r) => [r.rowId, r]));
  const nMap = new Map(next.map((r) => [r.rowId, r]));
  const qtyStr = (r: BomRow) => `Qty ${fmtVal(r.qty)} ${r.uom}`.trim();
  for (const rid of [...new Set(next.map((r) => r.rowId))].filter((id) => !oMap.has(id)).sort(pySort)) {
    const r = nMap.get(rid)!;
    recs.push(mk(r.fgCode, r.fgName, "PM added", r.pmCode, r.pmName, "", "", qtyStr(r)));
  }
  for (const rid of [...new Set(old.map((r) => r.rowId))].filter((id) => !nMap.has(id)).sort(pySort)) {
    const r = oMap.get(rid)!;
    recs.push(mk(r.fgCode, r.fgName, "PM removed", r.pmCode, r.pmName, "", qtyStr(r), ""));
  }
  const seen = new Set<string>();
  for (const a of old) {
    if (seen.has(a.rowId) || !nMap.has(a.rowId)) continue;
    seen.add(a.rowId);
    const b = nMap.get(a.rowId)!;
    for (const [label, key] of TRACKED) {
      const fa = fmtVal(a[key]);
      const fb = fmtVal(b[key]);
      if (fa !== fb) recs.push(mk(b.fgCode, b.fgName, "Modified", b.pmCode, b.pmName, label, fa, fb));
    }
  }
  return recs;
}

/** Problems that should block saving (limited to the FGs being edited, if given). */
export function validate(rows: BomRow[], onlyFgs?: string[]): string[] {
  const issues: string[] = [];
  let df = normalizeRows(rows);
  if (onlyFgs && onlyFgs.length) {
    const keep = new Set(onlyFgs.map(cleanCode));
    df = df.filter((r) => keep.has(r.fgCode));
  }
  if (df.some((r) => r.fgCode === "")) issues.push("Some lines have no FG code.");
  const names = new Map<string, Set<string>>();
  for (const r of df) {
    if (!names.has(r.fgCode)) names.set(r.fgCode, new Set());
    names.get(r.fgCode)!.add(r.fgName);
  }
  for (const fg of [...names.keys()].sort(pySort)) {
    if (names.get(fg)!.size > 1) issues.push(`${fg} has more than one FG name — keep one name per FG code.`);
  }
  if (df.some((r) => r.qty !== null && r.qty < 0)) issues.push("Negative quantities found.");
  return issues;
}

/** Existing master issues worth flagging (not blocking). */
export function dataWarnings(rows: BomRow[]): string[] {
  const names = new Map<string, string[]>();
  for (const r of rows) {
    if (!names.has(r.fgCode)) names.set(r.fgCode, []);
    const l = names.get(r.fgCode)!;
    if (!l.includes(r.fgName)) l.push(r.fgName);
  }
  return [...names.keys()]
    .sort(pySort)
    .filter((fg) => names.get(fg)!.length > 1)
    .map((fg) => `${fg} is used for ${names.get(fg)!.length} different FG names: ${names.get(fg)!.join(", ")}`);
}
