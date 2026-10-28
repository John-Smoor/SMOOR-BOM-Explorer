/**
 * Port of the calculation helpers in app.py: suggestions, search, attach_soh, fg_summary,
 * order_check, pm_name_lookup. These are the source of truth — keep them in lock-step with
 * the Python and run `npm run parity` after any change.
 */
import { STATUS, WAREHOUSE_COL_PATTERN, type SearchField } from "../config";
import { isNum, kahanSum, npRound, npSum } from "../num";
import type {
  BomRow, BomViewRow, FgSummaryRow, OcFgRow, OcLineRow, OcPmRow, OrderCheckResult, OrderInput, SohData,
} from "../types";

export const shortWh = (col: string) =>
  col.replace(" Stores Stock Balance", "").replace(" Stock Balance", "").trim() || col;

export function sohWhCols(soh: SohData): string[] {
  return soh.whCols.filter((c) => c.toLowerCase().includes(WAREHOUSE_COL_PATTERN.toLowerCase()));
}

/** attach_soh: SOH Total (+ warehouse split) joined on PM code; blank PM codes get no SOH. */
export function attachSoh(rows: BomRow[], soh: SohData): BomViewRow[] {
  const map = new Map(soh.items.map((i) => [i.itemCode, i]));
  const wh = sohWhCols(soh);
  return rows.map((r) => {
    const it = r.pmCode === "" ? undefined : map.get(r.pmCode);
    const sohWh: Record<string, number | null> = {};
    for (const c of wh) sohWh[c] = it ? it.wh[c] ?? null : null;
    return { ...r, sohTotal: it ? it.total : null, sohWh };
  });
}

export type Suggestion = { label: string; col: "fg" | "pm"; value: string };

/** label -> (column, exact value) for the type-ahead list, like Excel filter values. */
export function suggestions(df: BomRow[], field: SearchField): Map<string, Suggestion> {
  const out = new Map<string, Suggestion>();
  const firstBy = (rows: BomRow[], key: "fgCode" | "pmCode") => {
    const seen = new Set<string>();
    return rows.filter((r) => (seen.has(r[key]) ? false : (seen.add(r[key]), true)));
  };
  const fg = firstBy(df, "fgCode");
  const pm = firstBy(df.filter((r) => r.pmCode !== ""), "pmCode");
  // Map.set on an existing key keeps its position and updates the value — same as a Python dict.
  const setKeepPos = (label: string, col: "fg" | "pm", value: string) => out.set(label, { label, col, value });
  if (field === "Any" || field === "FG Code" || field === "FG Name") {
    for (const r of fg) {
      const lbl = field !== "FG Name" ? `${r.fgCode} — ${r.fgName}` : `${r.fgName} (${r.fgCode})`;
      setKeepPos((field === "Any" ? "FG · " : "") + lbl, "fg", r.fgCode);
    }
  }
  if (field === "Any" || field === "PM Code" || field === "PM Name") {
    for (const r of pm) {
      const lbl = field !== "PM Name" ? `${r.pmCode} — ${r.pmName}` : `${r.pmName} (${r.pmCode})`;
      setKeepPos((field === "Any" ? "PM · " : "") + lbl, "pm", r.pmCode);
    }
  }
  return out;
}

const FIELD_KEYS: Record<SearchField, (keyof BomRow)[]> = {
  "FG Code": ["fgCode"], "FG Name": ["fgName"], "PM Code": ["pmCode"], "PM Name": ["pmName"],
  Any: ["fgCode", "fgName", "pmCode", "pmName"],
};

/** search(): picks are OR-ed; free text needs every word; optional full-BOM expansion for PM hits. */
export function search(
  df: BomRow[], field: SearchField, picks: string[], sugg: Map<string, Suggestion>, fullBom: boolean,
): BomRow[] {
  if (!picks.length) return df;
  const keys = FIELD_KEYS[field];
  const hay = df.map((r) => keys.map((k) => String(r[k])).join(" ").toLowerCase());
  const mask = new Array<boolean>(df.length).fill(false);
  let pmHit = false;
  for (const p of picks) {
    const s = sugg.get(p);
    if (s) {
      const key = s.col === "fg" ? "fgCode" : "pmCode";
      df.forEach((r, i) => { if (r[key] === s.value) mask[i] = true; });
      pmHit ||= s.col === "pm";
    } else {
      const terms = String(p).toLowerCase().split(/\s+/).filter(Boolean);
      hay.forEach((h, i) => { if (terms.every((t) => h.includes(t))) mask[i] = true; });
      pmHit ||= field !== "FG Code" && field !== "FG Name";
    }
  }
  if (fullBom && pmHit) {
    const fgs = new Set(df.filter((_, i) => mask[i]).map((r) => r.fgCode));
    return df.filter((r) => fgs.has(r.fgCode));
  }
  return df.filter((_, i) => mask[i]);
}

/** Groups rows by key in order of first appearance (pandas groupby sort=False). */
function groupOrdered<T>(rows: T[], key: (r: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return [...m.entries()];
}
const pySort = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const GSEP = "\u0000";

/** Per FG: lines, PM cost/unit, and how many FG units current SOH can pack. */
export function fgSummary(view: BomViewRow[]): FgSummaryRow[] {
  return groupOrdered(view, (r) => r.fgCode + GSEP + r.fgName).map(([, g]) => {
    const cost = npSum(g.map((r) => (r.qty ?? 0) * (r.rate ?? 0)));
    const lim = g.filter((r) => isNum(r.qty) && r.qty > 0 && r.pmCode !== "");
    let buildable: number | null = null;
    let limiting = "";
    if (lim.length && lim.some((r) => isNum(r.sohTotal))) {
      const caps = lim.map((r) => Math.floor((r.sohTotal ?? 0) / (r.qty as number)));
      let mi = 0;
      for (let i = 1; i < caps.length; i++) if (caps[i] < caps[mi]) mi = i;
      buildable = Math.max(caps[mi], 0);
      limiting = lim[mi].pmCode;
    }
    return {
      "FG Code": g[0].fgCode, "FG Name": g[0].fgName, "PM Lines": g.length, "PM Cost / Unit": npRound(cost, 2),
      "Packable Units (SOH)": buildable, "Limiting PM": limiting,
    };
  });
}

/** order: FG Code, Order Qty -> (fg_view, pm_view, line_view) */
export function orderCheck(df: BomRow[], order: OrderInput[], soh: SohData): OrderCheckResult {
  const sohMap = new Map(soh.items.map((i) => [i.itemCode, i.total]));
  const qtyByFg = new Map<string, number>();
  for (const o of order) if (!qtyByFg.has(o.fgCode)) qtyByFg.set(o.fgCode, o.orderQty);

  type L = BomRow & { orderQty: number; required: number; soh: number };
  const lines: L[] = [];
  for (const r of df) {
    if (!qtyByFg.has(r.fgCode)) continue;
    if (r.pmCode === "" || !((r.qty ?? 0) > 0)) continue;
    const q = qtyByFg.get(r.fgCode)!;
    const s = sohMap.get(r.pmCode);
    lines.push({ ...r, orderQty: q, required: q * (r.qty as number), soh: isNum(s) ? s : 0 });
  }

  // PM view (groupby PM code, sorted)
  const byPm = new Map<string, L[]>();
  for (const l of lines) {
    if (!byPm.has(l.pmCode)) byPm.set(l.pmCode, []);
    byPm.get(l.pmCode)!.push(l);
  }
  const pmRows: OcPmRow[] = [...byPm.keys()].sort(pySort).map((code) => {
    const g = byPm.get(code)!;
    const total = kahanSum(g.map((l) => l.required));
    const sohV = g[0].soh;
    const shortfall = Math.max(total - sohV, 0);
    return {
      "PM Code": code, "PM Name": g[0].pmName, "Total Required": total, SOH: sohV,
      "Used in FGs": [...new Set(g.map((l) => l.fgCode))].join(", "),
      Shortfall: shortfall, "Cover %": npRound(Math.min(sohV / total, 1) * 100, 1),
      Status: shortfall > 0 ? STATUS.PM_SHORT : STATUS.PM_OK,
    };
  });
  const cover = new Map(pmRows.map((p) => [p["PM Code"], p.SOH / p["Total Required"]]));
  const shortfallMap = new Map(pmRows.map((p) => [p["PM Code"], p.Shortfall]));

  const fgRows: OcFgRow[] = [];
  for (const [, g] of groupOrdered(lines, (l) => l.fgCode + GSEP + l.fgName)) {
    const q = g[0].orderQty;
    const per = new Map<string, { bom: (number | null)[]; soh: number }>();
    for (const l of g) {
      if (!per.has(l.pmCode)) per.set(l.pmCode, { bom: [], soh: l.soh });
      per.get(l.pmCode)!.bom.push(l.qty);
    }
    const pms = [...per.keys()].sort(pySort);
    const alone = Math.max(Math.min(...pms.map((p) => Math.floor(per.get(p)!.soh / kahanSum(per.get(p)!.bom)))), 0);
    const fill = Math.min(Math.min(...pms.map((p) => cover.get(p)!)), 1);
    const shorts = pms.filter((p) => cover.get(p)! < 1);
    fgRows.push({
      "FG Code": g[0].fgCode, "FG Name": g[0].fgName, "Order Qty": q,
      Status: shorts.length ? STATUS.FG_SHORT : STATUS.FG_CAN_PLACE,
      "Placeable (with this whole order)": Math.floor(q * fill), "Max if ordered alone": alone,
      "Limiting PMs": shorts.join(", "),
    });
  }
  const inLines = new Set(lines.map((l) => l.fgCode));
  for (const o of order) {
    if (inLines.has(o.fgCode)) continue;
    fgRows.push({
      "FG Code": o.fgCode, "FG Name": "", "Order Qty": o.orderQty, Status: STATUS.FG_NO_BOM,
      "Placeable (with this whole order)": null, "Max if ordered alone": null, "Limiting PMs": "",
    });
  }

  const lineRows: OcLineRow[] = lines.map((l) => ({
    "Final FG Code": l.fgCode, "FG Name": l.fgName, "Order Qty": l.orderQty, "ERP packed code": l.pmCode,
    "Pkg Name": l.pmName, "BOM Qty / unit": l.qty, Required: l.required, SOH: l.soh,
    "PM Shortfall (whole order)": shortfallMap.get(l.pmCode)!,
  }));

  // sort_values(["Shortfall","Total Required"], ascending=False) — stable
  const pmSorted = pmRows
    .map((r, i) => [r, i] as const)
    .sort(([a, ia], [b, ib]) => b.Shortfall - a.Shortfall || b["Total Required"] - a["Total Required"] || ia - ib)
    .map(([r]) => r);
  return { fg: fgRows, pm: pmSorted, lines: lineRows };
}

/** PM code -> name: master first (last row wins), then ERP names for codes not in master. */
export function pmNameLookup(master: BomRow[], soh: SohData): Map<string, string | null> {
  const lk = new Map<string, string | null>();
  for (const r of master) lk.set(r.pmCode, r.pmName);
  if (soh.hasNameCol) for (const it of soh.items) if (!lk.has(it.itemCode)) lk.set(it.itemCode, it.erpName);
  lk.delete("");
  return lk;
}

/** Columns of the search view table (attach_soh output minus Row ID). */
export function viewColumns(soh: SohData, split: boolean): string[] {
  const base = ["Final FG Code", "FG Name", "ERP packed code", "Pkg Name", "QTY", "UOM", "Rate", "SOH Total"];
  if (!soh.items.length && !soh.whCols.length) return base;
  return split ? [...base, ...sohWhCols(soh).map((c) => `SOH · ${shortWh(c)}`)] : base;
}

export function viewRecord(r: BomViewRow, soh: SohData, split: boolean): Record<string, string | number | null> {
  const rec: Record<string, string | number | null> = {
    "Final FG Code": r.fgCode, "FG Name": r.fgName, "ERP packed code": r.pmCode, "Pkg Name": r.pmName,
    QTY: r.qty, UOM: r.uom, Rate: r.rate, "SOH Total": r.sohTotal,
  };
  if (split && (soh.items.length || soh.whCols.length)) for (const c of sohWhCols(soh)) rec[`SOH · ${shortWh(c)}`] = r.sohWh[c] ?? null;
  return rec;
}
