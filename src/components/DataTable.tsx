"use client";
import type { ReactNode } from "react";

export interface Col<R> {
  key: string;
  label?: string;
  numeric?: boolean;
  render?: (row: R) => ReactNode;
  cellClass?: (row: R) => string;
  width?: number;
}

export function DataTable<R extends Record<string, unknown>>({ columns, rows, maxHeight = 560, caption, rowKey, dense }: {
  columns: Col<R>[]; rows: R[]; maxHeight?: number; caption?: string; rowKey?: (r: R, i: number) => string; dense?: boolean;
}) {
  return (
    <div className={`table-wrap ${dense ? "table-wrap--dense" : ""}`} style={{ maxHeight }} tabIndex={0} role="region" aria-label={caption ?? "Table"}>
      <table className="table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.numeric ? "num" : ""} style={c.width ? { minWidth: c.width } : undefined}>{c.label ?? c.key}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey ? rowKey(r, i) : i}>
              {columns.map((c) => (
                <td key={c.key} className={`${c.numeric ? "num" : ""} ${c.cellClass?.(r) ?? ""}`}>
                  {c.render ? c.render(r) : String(r[c.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
