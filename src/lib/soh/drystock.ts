/** Port of erp_soh.py pure parsing: _report_to_df and drystock_to_soh. */
import { SOH_TOTAL_WAREHOUSES, WAREHOUSE_COL_PATTERN } from "../config";
import { cleanCode } from "../bom/core";
import { kahanSum, toNumeric } from "../num";
import type { SohItem, Table } from "../types";

const pyRepr = (cols: string[]) => `[${cols.map((c) => `'${c.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`).join(", ")}]`;

/** Frappe query_report.run message -> table with the same headers as the ERP export. */
export function reportToTable(msg: { columns?: unknown[]; result?: unknown[] }): Table {
  const labels: string[] = [];
  const fields: string[] = [];
  for (const c of msg.columns ?? []) {
    if (c && typeof c === "object") {
      const o = c as Record<string, string>;
      labels.push(o.label || o.fieldname);
      fields.push(o.fieldname || o.label);
    } else {
      const lbl = String(c).split(":")[0];
      labels.push(lbl);
      fields.push(lbl);
    }
  }
  const rows = (msg.result ?? []).filter((r) => r && (!Array.isArray(r) || r.length) && (typeof r !== "object" || Array.isArray(r) || Object.keys(r as object).length));
  const columns = [...new Set(labels)];
  const out: Table = { columns, rows: [] };
  if (rows.length && !Array.isArray(rows[0]) && typeof rows[0] === "object") {
    for (const r of rows as Record<string, unknown>[]) {
      const rec: Record<string, string | number | null> = {};
      labels.forEach((l, i) => { rec[l] = (r[fields[i]] ?? null) as string | number | null; });
      out.rows.push(rec);
    }
  } else {
    for (const r of rows) {
      if (!Array.isArray(r)) continue;
      const rec: Record<string, string | number | null> = {};
      labels.forEach((l, i) => { rec[l] = (r[i] ?? null) as string | number | null; });
      out.rows.push(rec);
    }
  }
  return out;
}

/** Item Code + one column per warehouse + SOH Total. */
export function drystockToSoh(dry: Table): { items: SohItem[]; whCols: string[]; hasNameCol: boolean } {
  const colMap = dry.columns.map((c) => [String(c).trim(), c] as const);
  const cols = colMap.map(([t]) => t);
  const src = (t: string) => colMap.find(([x]) => x === t)![1];
  const codeCol = cols.find((c) => c.toLowerCase() === "item code");
  if (!codeCol) throw new Error(`'Item Code' column not found. Columns: ${pyRepr(cols)}`);
  const nameCol = cols.find((c) => c.toLowerCase() === "item name");
  const whCols = cols.filter((c) => c.toLowerCase().includes(WAREHOUSE_COL_PATTERN.toLowerCase()));
  if (!whCols.length) throw new Error(`No warehouse columns containing '${WAREHOUSE_COL_PATTERN}'. Columns: ${pyRepr(cols)}`);

  const groups = new Map<string, { names: (string | null)[]; wh: Record<string, number[]> }>();
  for (const r of dry.rows) {
    const code = cleanCode(r[src(codeCol)]);
    if (code === "") continue;
    if (!groups.has(code)) groups.set(code, { names: [], wh: Object.fromEntries(whCols.map((c) => [c, []])) });
    const g = groups.get(code)!;
    if (nameCol) {
      const n = r[src(nameCol)];
      g.names.push(n === null || n === undefined || n === "" ? null : (n as string));
    }
    for (const c of whCols) g.wh[c].push(toNumeric(r[src(c)]) ?? 0);
  }
  const totalCols = whCols.filter((c) => SOH_TOTAL_WAREHOUSES.includes(c));
  const useCols = totalCols.length ? totalCols : whCols;
  const items: SohItem[] = [...groups.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map((code) => {
    const g = groups.get(code)!;
    const wh: Record<string, number> = {};
    for (const c of whCols) wh[c] = kahanSum(g.wh[c]);
    let total = 0;
    useCols.forEach((c, i) => { total = i === 0 ? wh[c] : total + wh[c]; });
    return { itemCode: code, erpName: nameCol ? g.names.find((n) => n !== null) ?? null : null, wh, total };
  });
  return { items, whCols, hasNameCol: !!nameCol };
}
