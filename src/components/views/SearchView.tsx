"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useApp } from "../AppContext";
import { DataTable, type Col } from "../DataTable";
import { MultiCombo } from "../MultiCombo";
import { Button, Empty, Field, Metric, Notice, PageHeader, Section, Toggle } from "../ui";
import { IDownload, ILink, IPrint, IReset } from "../Icons";
import { attachSoh, fgSummary, search, shortWh, sohWhCols, suggestions, viewColumns, viewRecord } from "@/lib/bom/calc";
import { SEARCH_FIELDS, type SearchField } from "@/lib/config";
import { numFmt, qtyFmt, rateFmt, sohFmt } from "@/lib/format";
import type { BomViewRow, FgSummaryRow } from "@/lib/types";
import { downloadXlsx } from "@/lib/client/api";

const FIELD_HINT: Record<SearchField, string> = {
  Any: "Matches FG code, FG name, PM code or PM name",
  "FG Code": "Finished-good code, e.g. FGC0836",
  "FG Name": "Finished-good name, e.g. truffle",
  "PM Code": "Packaging material code, e.g. PKG3037",
  "PM Name": "Packaging material name, e.g. wax paper",
};

export function SearchView() {
  const { master, soh } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  // state lives in the URL so a view can be shared
  const fieldParam = params.get("field") as SearchField | null;
  const field: SearchField = fieldParam && SEARCH_FIELDS.includes(fieldParam) ? fieldParam : "Any";
  const picks = params.getAll("q");
  const full = params.get("full") !== "0";
  const split = params.get("split") === "1";
  const setParams = (p: { field?: SearchField; picks?: string[]; full?: boolean; split?: boolean }) => {
    const n = new URLSearchParams();
    const f = p.field ?? field;
    if (f !== "Any") n.set("field", f);
    for (const q of p.picks ?? picks) n.append("q", q);
    if (!(p.full ?? full)) n.set("full", "0");
    if (p.split ?? split) n.set("split", "1");
    router.replace(`${pathname}${n.size ? `?${n}` : ""}`, { scroll: false });
  };

  const sugg = useMemo(() => suggestions(master, field), [master, field]);
  const options = useMemo(() => [...sugg.keys()], [sugg]);
  const res = useMemo(() => search(master, field, picks, sugg, full), [master, field, picks.join("\u0001"), sugg, full]); // eslint-disable-line react-hooks/exhaustive-deps
  const view = useMemo(() => attachSoh(res, soh), [res, soh]);
  const nFg = useMemo(() => new Set(view.map((r) => r.fgCode)).size, [view]);
  const zeroSoh = view.filter((r) => r.sohTotal === 0).length; // (SOH Total.fillna(-1) == 0).sum()
  const summary = useMemo(() => (picks.length && nFg ? fgSummary(view) : []), [view, picks.length, nFg]);
  const sohEmpty = !soh.whCols.length && !soh.items.length;

  const whCols = split && !sohEmpty ? sohWhCols(soh) : [];
  const columns: Col<BomViewRow & Record<string, unknown>>[] = [
    { key: "fgCode", label: "FG code", width: 110 },
    { key: "fgName", label: "FG name", width: 220 },
    { key: "pmCode", label: "PM code", width: 100 },
    { key: "pmName", label: "PM name", width: 240 },
    { key: "qty", label: "Qty", numeric: true, render: (r) => qtyFmt(r.qty) },
    { key: "uom", label: "UOM" },
    { key: "rate", label: "Rate", numeric: true, render: (r) => rateFmt(r.rate) },
    { key: "sohTotal", label: "SOH total", numeric: true, render: (r) => sohFmt(r.sohTotal), cellClass: (r) => (r.sohTotal === 0 ? "cell-bad" : "") },
    ...whCols.map((c) => ({ key: `wh:${c}`, label: shortWh(c), numeric: true, render: (r: BomViewRow) => sohFmt(r.sohWh[c] ?? null) })),
  ];

  const exportView = async () => {
    setExporting(true);
    try {
      const cols = viewColumns(soh, split);
      await downloadXlsx("BOM_view.xlsx", [{ name: "BOM", columns: cols, rows: view.map((r) => viewRecord(r, soh, split)) }]);
    } finally { setExporting(false); }
  };

  return (
    <>
      <PageHeader
        title="BOM search"
        lede="Find the packaging bill of materials for any finished good, or every FG that uses a packaging material."
        actions={<>
          <Button variant="ghost" onClick={() => { navigator.clipboard?.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>
            <ILink />{copied ? "Link copied" : "Copy link"}
          </Button>
          <Button variant="ghost" onClick={() => window.print()}><IPrint />Print</Button>
          <Button onClick={exportView} busy={exporting}><IDownload />Download view (.xlsx)</Button>
        </>}
      />

      <div className="card controls">
        <div className="controls-grid">
          <Field label="Search by" htmlFor="field" hint={FIELD_HINT[field]}>
            <select id="field" value={field} onChange={(e) => setParams({ field: e.target.value as SearchField, picks: [] })}>
              {SEARCH_FIELDS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Search" htmlFor="q" hint="Start typing — matches drop down. Pick one or more (they're combined with OR), or press Enter to search free text where every word must match.">
            <MultiCombo id="q" label="Search" options={options} value={picks} allowFreeText
              onChange={(v) => setParams({ picks: v })} placeholder="e.g. FGC0836, truffle, PKG3037, wax paper" />
          </Field>
        </div>
        <div className="controls-row">
          <Toggle label="Full BOM of matched FGs" checked={full} onChange={(v) => setParams({ full: v })} hint="For PM searches: show every PM of the FGs that use it" />
          <Toggle label="Warehouse split" checked={split} onChange={(v) => setParams({ split: v })} hint="Adds one SOH column per DryStock warehouse. SOH total is Avalahalli + Jigani." />
          {(picks.length > 0 || field !== "Any" || !full || split) && (
            <Button variant="ghost" className="btn--sm" onClick={() => router.replace(pathname, { scroll: false })}><IReset />Reset</Button>
          )}
        </div>
      </div>

      {sohEmpty && <Notice tone="warn" title="Stock hasn't been pulled yet">SOH columns stay blank until you refresh SOH from the ERP or upload a DryStock export in the sidebar.</Notice>}

      <div className="metrics">
        <Metric label="FGs" value={nFg.toLocaleString("en-IN")} />
        <Metric label="BOM lines" value={view.length.toLocaleString("en-IN")} />
        <Metric label="PM lines with zero SOH" value={zeroSoh.toLocaleString("en-IN")} tone={zeroSoh ? "bad" : undefined} />
      </div>

      {view.length ? (
        <Section title={picks.length ? "Matching BOM lines" : "All BOM lines"} aside={<span className="muted">{view.length.toLocaleString("en-IN")} {view.length === 1 ? "line" : "lines"}</span>}>
          <DataTable caption="BOM lines" columns={columns} rows={view as (BomViewRow & Record<string, unknown>)[]} rowKey={(r) => r.rowId} maxHeight={Math.min(38 * (view.length + 1), 560)} />
        </Section>
      ) : (
        <Empty title="No BOM lines match">Try fewer words, a different “Search by” field, or remove a pick.</Empty>
      )}

      {summary.length > 0 && (
        <Section title={`FG summary (${nFg})`} collapsible defaultOpen={nFg <= 10}
          aside={<span className="muted">PM cost per unit and how many units current SOH can pack</span>}>
          <DataTable<FgSummaryRow & Record<string, unknown>> caption="FG summary" rows={summary as (FgSummaryRow & Record<string, unknown>)[]} columns={[
            { key: "FG Code", label: "FG code" }, { key: "FG Name", label: "FG name" },
            { key: "PM Lines", label: "PM lines", numeric: true, render: (r) => numFmt(r["PM Lines"]) },
            { key: "PM Cost / Unit", label: "PM cost / unit", numeric: true, render: (r) => numFmt(r["PM Cost / Unit"]) },
            { key: "Packable Units (SOH)", label: "Packable units (SOH)", numeric: true, render: (r) => numFmt(r["Packable Units (SOH)"]), cellClass: (r) => (r["Packable Units (SOH)"] === 0 ? "cell-bad" : "") },
            { key: "Limiting PM", label: "Limiting PM" },
          ]} />
        </Section>
      )}
    </>
  );
}
