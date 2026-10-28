"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../AppContext";
import { DataTable } from "../DataTable";
import { FgImage } from "../FgImage";
import { Button, Empty, Metric, Notice, PageHeader, Section, StatusBadge } from "../ui";
import { IBack, IClose, IDownload, IPlus, IPrint, IReset, ISearch } from "../Icons";
import { orderCheck } from "@/lib/bom/calc";
import { STATUS } from "@/lib/config";
import { numFmt, pctFmt, sohFmt } from "@/lib/format";
import type { OcFgRow, OcLineRow, OcPmRow } from "@/lib/types";
import { downloadXlsx } from "@/lib/client/api";

type R = Record<string, unknown>;
const FG_COLS = ["FG Code", "FG Name", "Order Qty", "Status", "Placeable (with this whole order)", "Max if ordered alone", "Limiting PMs"];
const PM_COLS = ["PM Code", "PM Name", "Total Required", "SOH", "Used in FGs", "Shortfall", "Cover %", "Status"];
const LINE_COLS = ["Final FG Code", "FG Name", "Order Qty", "ERP packed code", "Pkg Name", "BOM Qty / unit", "Required", "SOH", "PM Shortfall (whole order)"];

export function OrderCheckView() {
  const { master, soh, order, setOrder, images, categories } = useApp();
  // one entry per FG code, first row's name (drop_duplicates on FG code)
  const products = useMemo(() => {
    const seen = new Set<string>();
    return master.filter((r) => (seen.has(r.fgCode) ? false : (seen.add(r.fgCode), true))).map((r) => ({ code: r.fgCode, name: r.fgName }));
  }, [master]);
  const nameOf = useMemo(() => new Map(products.map((p) => [p.code, p.name])), [products]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const NONE = "__none__";
  const catList = useMemo(() => {
    const counts = new Map<string, number>();
    let none = 0;
    for (const p of products) { const c = categories[p.code]; if (c) counts.set(c, (counts.get(c) ?? 0) + 1); else none++; }
    return { list: [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])), none };
  }, [products, categories]);
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<"pick" | "results">(order.result ? "results" : "pick");
  const [formError, setFormError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const sohEmpty = !soh.items.length && !soh.whCols.length;
  const picked = order.picked.filter((c) => nameOf.has(c));

  const shown = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return products.filter((p) => (!onlyPicked || picked.includes(p.code)) && (!cat || (cat === NONE ? !categories[p.code] : categories[p.code] === cat)) && terms.every((t) => `${p.code} ${p.name}`.toLowerCase().includes(t)));
  }, [products, q, onlyPicked, picked, cat, categories]);

  /** Runs the unchanged order_check on the current order (picked FGs with qty > 0, in the order they were added). */
  const run = (codes: string[], qty: Record<string, number>) => {
    const o = codes.map((c) => ({ fgCode: c, orderQty: qty[c] ?? 0 })).filter((x) => x.orderQty > 0);
    return o.length ? orderCheck(master, o, soh) : null;
  };
  /** Change qty (or remove with qty = 0) from the results page and recalculate. */
  const updateItem = (code: string, qty: number) => {
    setOrder((s) => {
      const nextPicked = qty > 0 ? s.picked : s.picked.filter((c) => c !== code);
      const nextQty = { ...s.qtyMemory, [code]: qty };
      const result = run(nextPicked.filter((c) => nameOf.has(c)), nextQty);
      if (!result) setView("pick");
      return { picked: nextPicked, qtyMemory: nextQty, result };
    });
  };

  const process = () => {
    setFormError(null);
    const result = run(picked, order.qtyMemory);
    if (!result) { setFormError("Enter a quantity for at least one FG."); setOrder((s) => ({ ...s, result: null })); return; }
    setOrder((s) => ({ ...s, result }));
    setView("results");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const res = order.result;
  if (view === "results" && res) {
    const short = res.pm.filter((p) => p.Shortfall > 0);
    const canPlace = res.fg.filter((f) => f.Status === STATUS.FG_CAN_PLACE).length;
    return (
      <>
        <button type="button" className="back-link" onClick={() => setView("pick")}><IBack />Back to products</button>
        <PageHeader title="Your order"
          lede={<>{res.fg.length} product{res.fg.length === 1 ? "" : "s"} · checked against SOH {soh.meta.fetched_at ? `pulled ${soh.meta.fetched_at}` : "(not pulled yet)"}. Change quantities or remove items below — results update instantly.</>}
          actions={<>
            <Button variant="primary" onClick={() => setView("pick")}><IPlus />Add more items</Button>
            <Button variant="ghost" onClick={() => window.print()}><IPrint />Print</Button>
            <Button busy={exporting} onClick={async () => {
              setExporting(true);
              try {
                await downloadXlsx("Order_Check.xlsx", [
                  { name: "FG Breakdown", columns: FG_COLS, rows: res.fg as unknown as R[] },
                  { name: "Limiting PMs", columns: PM_COLS, rows: short as unknown as R[] },
                  { name: "All PMs", columns: PM_COLS, rows: res.pm as unknown as R[] },
                  { name: "Line Detail", columns: LINE_COLS, rows: res.lines as unknown as R[] },
                ]);
              } finally { setExporting(false); }
            }}><IDownload />Download order check (.xlsx)</Button>
          </>}
        />
        <div className="metrics">
          <Metric label="FGs in order" value={res.fg.length} />
          <Metric label="FGs that can be placed in full" value={canPlace} tone={canPlace === res.fg.length ? "good" : undefined} />
          <Metric label="Limiting PMs" value={short.length} tone={short.length ? "bad" : "good"} />
        </div>
        {short.length === 0 && <Notice tone="success">Current PM stock covers the whole order.</Notice>}

        <Section title="FG breakdown">
          <p className="caption">“Placeable (whole order)” shares stock across all FGs in the order, since many PMs are common. “Max if ordered alone” is what this FG could take if it got all the stock.</p>
          <div className="fg-grid-cards">
            {res.fg.map((f) => (
              <ResultCard key={f["FG Code"]} f={f} name={f["FG Name"] || nameOf.get(f["FG Code"]) || f["FG Code"]} src={images[f["FG Code"]]}
                onQty={(q) => updateItem(f["FG Code"], q)} onRemove={() => updateItem(f["FG Code"], 0)} />
            ))}
            <button type="button" className="add-card" onClick={() => setView("pick")}>
              <span className="add-card-icon"><IPlus /></span>
              <b>Add more items</b>
              <span>Pick from all products</span>
            </button>
          </div>
        </Section>

        <Section title="Limiting PMs">
          {short.length === 0 ? <p className="muted">No PM is short.</p> : <PmTable rows={short} highlight />}
        </Section>
        <Section title="All PMs needed for this order" collapsible defaultOpen={false} aside={<span className="muted">{res.pm.length} PMs</span>}>
          <PmTable rows={res.pm} />
        </Section>
        <Section title="Line-level detail (FG × PM)" collapsible defaultOpen={false} aside={<span className="muted">{res.lines.length} lines</span>}>
          <DataTable<OcLineRow & R> caption="Line detail" rows={res.lines as (OcLineRow & R)[]} columns={[
            { key: "Final FG Code", label: "FG code" }, { key: "FG Name", label: "FG name" },
            { key: "Order Qty", label: "Order qty", numeric: true, render: (r) => numFmt(r["Order Qty"]) },
            { key: "ERP packed code", label: "PM code" }, { key: "Pkg Name", label: "PM name" },
            { key: "BOM Qty / unit", label: "BOM qty / unit", numeric: true, render: (r) => numFmt(r["BOM Qty / unit"]) },
            { key: "Required", numeric: true, render: (r) => numFmt(r.Required) },
            { key: "SOH", numeric: true, render: (r) => numFmt(r.SOH) },
            { key: "PM Shortfall (whole order)", label: "PM shortfall (whole order)", numeric: true, render: (r) => numFmt(r["PM Shortfall (whole order)"]), cellClass: (r) => (r["PM Shortfall (whole order)"] > 0 ? "cell-bad" : "") },
          ]} />
        </Section>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Order check" lede="Click a product to add it to the order and enter the quantity, then process to see whether current PM stock covers it."
        actions={res && <Button variant="ghost" onClick={() => setView("results")}>View last results</Button>} />
      {sohEmpty && <Notice tone="warn" title="SOH hasn't been pulled yet">Refresh it from the sidebar first, otherwise everything shows as short.</Notice>}

      <div className="tile-bar">
        <label className="tile-search">
          <ISearch />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products by name or FG code" aria-label="Search products" />
          {q && <button type="button" aria-label="Clear search" onClick={() => setQ("")}><IClose /></button>}
        </label>
        {catList.list.length > 0 && (
          <label className="cat-select">
            <span className="sr-only">Category</span>
            <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter by category">
              <option value="">All categories</option>
              {catList.list.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
              {catList.none > 0 && <option value={NONE}>No category ({catList.none})</option>}
            </select>
          </label>
        )}
        <div className="pills" role="radiogroup" aria-label="Show">
          <button role="radio" aria-checked={!onlyPicked} className={!onlyPicked ? "is-on" : ""} onClick={() => setOnlyPicked(false)}>All ({products.length})</button>
          <button role="radio" aria-checked={onlyPicked} className={onlyPicked ? "is-on" : ""} onClick={() => setOnlyPicked(true)}>In order ({picked.length})</button>
        </div>
      </div>

      {shown.length ? (
        <div className="tile-grid">
          {shown.map((p) => {
            const inOrder = picked.includes(p.code);
            return (
              <button key={p.code} type="button" className={`tile ${inOrder ? "is-picked" : ""}`} onClick={() => setOpen(p.code)} aria-pressed={inOrder}
                aria-label={`${p.name}${inOrder ? `, in order, quantity ${order.qtyMemory[p.code]}` : ""}`}>
                {inOrder && <span className="tile-tag">✓ Qty {numFmt(order.qtyMemory[p.code] ?? 0)}</span>}
                <FgImage src={images[p.code]} name={p.name} />
                <span className="tile-name">{p.name}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <Empty title={onlyPicked ? "No products in the order yet" : "No products match"}>{onlyPicked ? "Switch to All and click a product to add it." : cat ? "Try another category, or choose All categories." : "Try another word or the FG code."}</Empty>
      )}

      {formError && <Notice tone="error">{formError}</Notice>}
      {picked.length > 0 && (
        <div className="order-tray" role="region" aria-label="Your order">
          <div className="tray-thumbs">
            {picked.slice(0, 5).map((c) => <button key={c} type="button" title={nameOf.get(c)} onClick={() => setOpen(c)}><FgImage src={images[c]} name={nameOf.get(c) ?? c} /></button>)}
            {picked.length > 5 && <span className="tray-more">+{picked.length - 5}</span>}
          </div>
          <span className="tray-info">{picked.length} product{picked.length === 1 ? "" : "s"} in this order</span>
          <Button variant="ghost" onClick={() => { setOrder(() => ({ picked: [], qtyMemory: {}, result: null })); setFormError(null); }}>Clear</Button>
          <Button variant="primary" className="btn--lg" onClick={process}>Process order</Button>
        </div>
      )}

      {open && (
        <OrderModal code={open} name={nameOf.get(open) ?? open} src={images[open]} inOrder={picked.includes(open)} qty={order.qtyMemory[open]}
          onClose={() => setOpen(null)}
          onSave={(qty) => {
            setOrder((s) => ({ ...s, picked: s.picked.includes(open) ? s.picked : [...s.picked, open], qtyMemory: { ...s.qtyMemory, [open]: qty } }));
            setFormError(null); setOpen(null);
          }}
          onRemove={() => { setOrder((s) => ({ ...s, picked: s.picked.filter((c) => c !== open) })); setOpen(null); }}
        />
      )}
    </>
  );
}

function OrderModal({ code, name, src, inOrder, qty, onClose, onSave, onRemove }: {
  code: string; name: string; src?: string; inOrder: boolean; qty?: number; onClose: () => void; onSave: (q: number) => void; onRemove: () => void;
}) {
  const [raw, setRaw] = useState(qty ? String(qty) : "");
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const save = () => {
    const n = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(n)) return setErr("Enter the order quantity.");
    if (!Number.isInteger(n)) return setErr("Whole units only.");
    if (n <= 0) return setErr(inOrder ? "Use Remove to take it out of the order." : "Enter a quantity above 0.");
    onSave(n);
  };
  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="om-title">
        <button className="modal-x" aria-label="Close" onClick={onClose}><IClose /></button>
        <FgImage src={src} name={name} className="modal-img" />
        <form className="modal-body" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <h2 id="om-title">{name}</h2>
          <span className="muted">{code}</span>
          <label className="kv kv--input" htmlFor="om-qty">
            <span>Order qty</span>
            <input id="om-qty" ref={inputRef} type="number" inputMode="numeric" min={1} step={1} value={raw} aria-invalid={!!err}
              onChange={(e) => { setRaw(e.target.value); setErr(null); }} placeholder="0" />
          </label>
          {err && <span className="field-error">{err}</span>}
          <div className="modal-actions">
            {inOrder && <Button type="button" variant="ghost" className="text-danger" onClick={onRemove}>Remove</Button>}
            <span className="spacer" />
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary">{inOrder ? "Update order" : "Add to order"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ResultCard({ f, name, src, onQty, onRemove }: { f: OcFgRow; name: string; src?: string; onQty: (q: number) => void; onRemove: () => void }) {
  const qty = f["Order Qty"];
  const [raw, setRaw] = useState(String(qty));
  const [err, setErr] = useState(false);
  useEffect(() => { setRaw(String(qty)); setErr(false); }, [qty]);
  const commit = (v: string) => {
    const n = Number(v);
    if (v.trim() === "" || !Number.isInteger(n) || n < 1) { setErr(true); return; }
    setErr(false);
    if (n !== qty) onQty(n);
  };
  return (
    <article className="result-card">
      <button type="button" className="rc-remove" aria-label={`Remove ${name}`} title="Remove from order" onClick={onRemove}><IClose /></button>
      <FgImage src={src} name={name} />
      <div className="result-body">
        <h3 title={name}>{name}</h3>
        <span className="muted">{f["FG Code"]}</span>
        <div><StatusBadge value={f.Status} /></div>
        <div className={`stepper ${err ? "has-error" : ""}`} role="group" aria-label={`Order quantity for ${name}`}>
          <button type="button" aria-label="Decrease" disabled={qty <= 1} onClick={() => onQty(qty - 1)}>−</button>
          <input inputMode="numeric" type="number" min={1} step={1} value={raw} aria-label="Order qty" aria-invalid={err}
            onChange={(e) => setRaw(e.target.value)} onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commit((e.target as HTMLInputElement).value); }} />
          <button type="button" aria-label="Increase" onClick={() => onQty(qty + 1)}>+</button>
        </div>
        {err && <span className="field-error">Whole units, 1 or more</span>}
        <dl>
          <div><dt>Placeable (order)</dt><dd>{numFmt(f["Placeable (with this whole order)"])}</dd></div>
          <div><dt>Max if alone</dt><dd>{numFmt(f["Max if ordered alone"])}</dd></div>
          <div><dt>Limiting PMs</dt><dd className={f["Limiting PMs"] ? "cell-bad" : ""}>{f["Limiting PMs"] || "—"}</dd></div>
        </dl>
      </div>
    </article>
  );
}

function PmTable({ rows, highlight }: { rows: OcPmRow[]; highlight?: boolean }) {
  // the limiting table uses the Streamlit Styler formats; "All PMs" shows raw values
  const f = highlight ? sohFmt : numFmt;
  return (
    <DataTable<OcPmRow & R> caption="PMs" rows={rows as (OcPmRow & R)[]} columns={[
      { key: "PM Code", label: "PM code" }, { key: "PM Name", label: "PM name" },
      { key: "Total Required", label: "Total required", numeric: true, render: (r) => f(r["Total Required"]) },
      { key: "SOH", numeric: true, render: (r) => f(r.SOH) },
      { key: "Used in FGs", label: "Used in FGs" },
      { key: "Shortfall", numeric: true, render: (r) => f(r.Shortfall), cellClass: (r) => (highlight || r.Shortfall > 0 ? "cell-bad" : "") },
      { key: "Cover %", label: "Cover", numeric: true, render: (r) => (highlight ? pctFmt(r["Cover %"]) : numFmt(r["Cover %"])) },
      { key: "Status", render: (r) => <StatusBadge value={r.Status} /> },
    ]} />
  );
}
