/** Display formatting only — mirrors the Streamlit Styler formats; never feeds back into calculations. */
import { fmtFixed, fmtG, isNum } from "./num";

export const DASH = "—";
export const qtyFmt = (v: number | null) => (isNum(v) ? fmtG(v) : DASH); // "{:g}"
export const rateFmt = (v: number | null) => (isNum(v) ? fmtFixed(v, 2) : DASH); // "{:.2f}"
export const sohFmt = (v: number | null) => (isNum(v) ? fmtFixed(v, 0, true) : DASH); // "{:,.0f}"
export const pctFmt = (v: number | null) => (isNum(v) ? `${fmtFixed(v, 1)}%` : DASH); // "{:.1f}%"
/** Unstyled numeric columns: integers with separators, other values at full precision (up to 4 dp). */
export const numFmt = (v: number | null | undefined) => {
  if (!isNum(v ?? null)) return DASH;
  const x = v as number;
  if (Number.isInteger(x)) return fmtFixed(x, 0, true);
  return fmtFixed(x, 4, true).replace(/0+$/, "").replace(/\.$/, "");
};
