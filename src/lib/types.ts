export interface BomRow {
  fgCode: string;
  fgName: string;
  pmCode: string;
  pmName: string;
  qty: number | null;
  uom: string;
  rate: number | null;
  rowId: string;
}

export interface SohItem {
  itemCode: string;
  erpName: string | null;
  /** warehouse column -> balance, in SohData.whCols order */
  wh: Record<string, number | null>;
  total: number | null;
}

export interface SohData {
  items: SohItem[];
  whCols: string[];
  /** SOH sheet has an "ERP Item Name" column */
  hasNameCol: boolean;
  meta: Record<string, string>;
}

/** A BOM row with SOH attached (attach_soh). */
export interface BomViewRow extends BomRow {
  sohTotal: number | null;
  sohWh: Record<string, number | null>;
}

export interface FgSummaryRow {
  "FG Code": string;
  "FG Name": string;
  "PM Lines": number;
  "PM Cost / Unit": number;
  "Packable Units (SOH)": number | null;
  "Limiting PM": string;
}

export interface OrderInput {
  fgCode: string;
  orderQty: number;
}

export interface OcFgRow {
  "FG Code": string;
  "FG Name": string;
  "Order Qty": number;
  Status: string;
  "Placeable (with this whole order)": number | null;
  "Max if ordered alone": number | null;
  "Limiting PMs": string;
}

export interface OcPmRow {
  "PM Code": string;
  "PM Name": string;
  "Total Required": number;
  SOH: number;
  "Used in FGs": string;
  Shortfall: number;
  "Cover %": number;
  Status: string;
}

export interface OcLineRow {
  "Final FG Code": string;
  "FG Name": string;
  "Order Qty": number;
  "ERP packed code": string;
  "Pkg Name": string;
  "BOM Qty / unit": number | null;
  Required: number;
  SOH: number;
  "PM Shortfall (whole order)": number;
}

export interface OrderCheckResult {
  fg: OcFgRow[];
  pm: OcPmRow[];
  lines: OcLineRow[];
}

export interface DiffRow {
  "FG Code": string;
  "FG Name": string;
  Action: string;
  "PM Code": string;
  "PM Name": string;
  Field: string;
  "Old Value": string;
  "New Value": string;
}

export type HistoryRow = Record<string, string>;

export type Cell = string | number | null;
export type Table = { columns: string[]; rows: Record<string, Cell>[] };
