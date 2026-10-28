/** Column names and business constants — identical to config.py. */
export const COL_FG_CODE = "Final FG Code";
export const COL_FG_NAME = "FG Name";
export const COL_PM_CODE = "ERP packed code";
export const COL_PM_NAME = "Pkg Name";
export const COL_QTY = "QTY";
export const COL_UOM = "UOM";
export const COL_RATE = "Rate";
export const COL_ROW_ID = "Row ID";
export const BOM_COLUMNS = [COL_FG_CODE, COL_FG_NAME, COL_PM_CODE, COL_PM_NAME, COL_QTY, COL_UOM, COL_RATE] as const;

/** Every DryStock column whose header contains this text is a warehouse SOH column. */
export const WAREHOUSE_COL_PATTERN = "Stock Balance";
/** Warehouses that make up "SOH Total". Empty list = sum all warehouses. */
export const SOH_TOTAL_WAREHOUSES = ["Avalahalli Stores Stock Balance", "Jigani Stores Stock Balance"];

export const UOM_OPTIONS = ["nos.", "nos", "No.", "kg", "g", "m", "roll"];

export const SEARCH_FIELDS = ["Any", "FG Code", "FG Name", "PM Code", "PM Name"] as const;
export type SearchField = (typeof SEARCH_FIELDS)[number];

/** Status strings kept verbatim from the Streamlit app (they appear in exports). */
export const STATUS = {
  PM_SHORT: "❌ Short",
  PM_OK: "✅ OK",
  FG_CAN_PLACE: "✅ Can place",
  FG_SHORT: "❌ Short",
  FG_NO_BOM: "⚠️ No BOM lines",
} as const;
