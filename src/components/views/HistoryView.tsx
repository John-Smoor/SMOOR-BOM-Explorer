"use client";
import { useEffect, useMemo, useState } from "react";
import { DataTable } from "../DataTable";
import { MultiCombo } from "../MultiCombo";
import { Button, Empty, Field, Notice, PageHeader, Spinner } from "../ui";
import { IDownload, IReset } from "../Icons";
import { api, downloadXlsx } from "@/lib/client/api";
import type { HistoryRow } from "@/lib/types";

const sortU = (a: string[]) => [...new Set(a)].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));

export function HistoryView() {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fgF, setFgF] = useState<string[]>([]);
  const [actF, setActF] = useState<string[]>([]);
  const [whoF, setWhoF] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const load = () => api<{ rows: HistoryRow[] }>("/api/history").then((r) => { setRows(r.rows); setErr(null); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    let h = rows;
    if (fgF.length) { const s = new Set(fgF.map((x) => x.split(" — ")[0])); h = h.filter((r) => s.has(r["FG Code"])); }
    if (actF.length) h = h.filter((r) => actF.includes(r.Action));
    if (whoF.length) h = h.filter((r) => whoF.includes(r["Changed By"]));
    return h.map((r, i) => [r, i] as const).sort(([a, ia], [b, ib]) => (a.Timestamp < b.Timestamp ? 1 : a.Timestamp > b.Timestamp ? -1 : ia - ib)).map(([r]) => r);
  }, [rows, fgF, actF, whoF]);

  if (err) return <Notice tone="error" title="Couldn't load history" action={<Button onClick={load}>Try again</Button>}>{err}</Notice>;
  if (!rows) return <div className="loading-page"><Spinner label="Loading" /> Loading history…</div>;
  const cols = rows.length ? Object.keys(rows[0]) : [];

  return (
    <>
      <PageHeader title="History" lede="Every published change: who made it, when, and the old and new values."
        actions={rows.length > 0 && <Button busy={busy} onClick={async () => { setBusy(true); try { await downloadXlsx("BOM_History.xlsx", [{ name: "History", columns: cols, rows: filtered }]); } finally { setBusy(false); } }}><IDownload />Download history</Button>} />
      {!rows.length ? <Empty title="No published changes yet">Changes appear here once the PM team publishes a draft.</Empty> : (
        <>
          <div className="card controls">
            <div className="filters-grid">
              <Field label="FG"><MultiCombo label="FG" options={sortU(rows.map((r) => `${r["FG Code"]} — ${r["FG Name"]}`))} value={fgF} onChange={setFgF} placeholder="All FGs" /></Field>
              <Field label="Action"><MultiCombo label="Action" options={sortU(rows.map((r) => r.Action))} value={actF} onChange={setActF} placeholder="All actions" /></Field>
              <Field label="Changed by"><MultiCombo label="Changed by" options={sortU(rows.map((r) => r["Changed By"]))} value={whoF} onChange={setWhoF} placeholder="Everyone" /></Field>
            </div>
            {(fgF.length + actF.length + whoF.length > 0) && <div className="controls-row"><Button variant="ghost" className="btn--sm" onClick={() => { setFgF([]); setActF([]); setWhoF([]); }}><IReset />Clear filters</Button></div>}
          </div>
          {filtered.length ? (
            <DataTable caption="Change history" rows={filtered} columns={cols.map((c) => ({ key: c, cellClass: c === "Old Value" ? () => "cell-old" : c === "New Value" ? () => "cell-new" : undefined }))} />
          ) : <Empty title="No changes match these filters">Clear a filter to see more.</Empty>}
        </>
      )}
    </>
  );
}
