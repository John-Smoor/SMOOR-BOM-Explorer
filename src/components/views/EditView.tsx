"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "../AppContext";
import { requestUnlock } from "../Shell";
import { ILock } from "../Icons";
import { Button, Empty, Field, Notice, PageHeader, Spinner } from "../ui";
import { MultiCombo } from "../MultiCombo";
import { IPlus, IReset, ITrash } from "../Icons";
import { attachSoh } from "@/lib/bom/calc";
import { UOM_OPTIONS } from "@/lib/config";
import { sohFmt } from "@/lib/format";
import { api, ApiError } from "@/lib/client/api";
import type { BomRow, SohData } from "@/lib/types";

interface EditorPayload { draft: BomRow[]; soh: SohData; warnings: string[]; hasDraft: boolean; meta: Record<string, string> }
interface Line { key: string; rowId: string | null; pmCode: string; pmName: string; qty: string; uom: string; rate: string; soh: number | null; isNew: boolean }

const NEW = "__new__";
const numStr = (v: number | null) => (v === null ? "" : String(v));
const parseNum = (s: string): number | null | "bad" => {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : "bad";
};
let seq = 0;

export function EditView() {
  const { user } = useApp();
  const router = useRouter();
  const [data, setData] = useState<EditorPayload | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [fgCode, setFgCode] = useState("");
  const [fgName, setFgName] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [flash, setFlash] = useState<{ tone: "success" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState<"" | "save" | "delete">("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try { setData(await api<EditorPayload>("/api/draft")); setLoadErr(null); }
    catch (e) { setLoadErr((e as Error).message); }
  }, []);
  useEffect(() => { if (user) load(); }, [user, load]);

  const fgs = useMemo(() => {
    const seen = new Set<string>();
    return (data?.draft ?? []).filter((r) => (seen.has(r.fgCode) ? false : (seen.add(r.fgCode), true))).map((r) => ({ code: r.fgCode, name: r.fgName }));
  }, [data]);

  const resetFrom = useCallback((p: string, d: EditorPayload) => {
    const orig = p === NEW ? "" : p;
    const rows = orig ? d.draft.filter((r) => r.fgCode === orig) : [];
    setFgCode(orig);
    setFgName(rows[0]?.fgName ?? "");
    setLines(attachSoh(rows, d.soh).map((r) => ({
      key: `l${seq++}`, rowId: r.rowId, pmCode: r.pmCode, pmName: r.pmName, qty: numStr(r.qty), uom: r.uom, rate: numStr(r.rate), soh: r.sohTotal, isNew: false,
    })));
    setErrors([]); setConfirmDelete(false);
  }, []);

  useEffect(() => {
    if (!data) return;
    const p = pick && (pick === NEW || fgs.some((f) => f.code === pick)) ? pick : fgs[0]?.code ?? NEW; // default: first FG
    if (p !== pick) setPick(p);
    resetFrom(p, data);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return <Notice tone="warn" title="This page is for the PM team" action={<Button variant="primary" onClick={() => requestUnlock("/edit", "Edit BOM")}><ILock />Enter password</Button>}>Enter the editor password to open Edit BOM.</Notice>;
  if (loadErr) return <Notice tone="error" title="Couldn't load the draft" action={<Button onClick={load}>Try again</Button>}>{loadErr}</Notice>;
  if (!data || pick === null) return <div className="loading-page"><Spinner label="Loading" /> Loading the BOM…</div>;

  const origCode = pick === NEW ? "" : pick;
  const fgName_ = (c: string) => fgs.find((f) => f.code === c)?.name ?? "";
  const update = (k: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const lineErr = (l: Line) => {
    const e: Partial<Record<"pmCode" | "qty" | "rate", string>> = {};
    if (l.isNew && !l.pmCode.trim()) e.pmCode = "Required";
    const q = parseNum(l.qty); if (q === "bad") e.qty = "Not a number"; else if (q !== null && q < 0) e.qty = "Min 0";
    const r = parseNum(l.rate); if (r === "bad") e.rate = "Not a number"; else if (r !== null && r < 0) e.rate = "Min 0";
    return e;
  };
  const hasFieldErrors = lines.some((l) => Object.keys(lineErr(l)).length);

  const save = async () => {
    setErrors([]); setFlash(null);
    if (hasFieldErrors) { setErrors(["Fix the highlighted cells before saving."]); return; }
    setBusy("save");
    try {
      await api("/api/draft/save", { json: {
        origCode, fgCode, fgName,
        lines: lines.map((l) => ({ rowId: l.rowId, pmCode: l.pmCode, pmName: l.pmName, qty: parseNum(l.qty), uom: l.uom || null, rate: parseNum(l.rate) })),
      } });
      setFlash({ tone: "success", text: "Saved to draft. Review and publish in Pending changes." });
      const code = fgCode.replaceAll(" ", "").trim().toUpperCase();
      setPick(code);
      await load();
      router.refresh();
    } catch (e) {
      setErrors(e instanceof ApiError ? e.errors : [(e as Error).message]);
    } finally { setBusy(""); }
  };

  const del = async () => {
    setBusy("delete");
    try {
      await api("/api/draft/delete-fg", { json: { code: origCode } });
      setFlash({ tone: "warn", text: `${origCode} removed in draft.` });
      setPick(null);
      await load();
      router.refresh();
    } catch (e) { setErrors([(e as Error).message]); }
    finally { setBusy(""); setConfirmDelete(false); }
  };

  return (
    <>
      <PageHeader title="Edit BOM" lede="Change PM lines for one FG at a time. Saves go to a draft — nothing is live until it's published from Pending changes." />

      {data.warnings.map((w) => (
        <Notice key={w} tone="warn" title="Data check">{w}. Saving this FG will merge them under one name — give one a new code.</Notice>
      ))}
      {data.hasDraft && (
        <Notice tone="info" action={<Link className="btn btn--secondary btn--sm" href="/pending">Review draft</Link>}>
          Working on an unpublished draft (last edit by {data.meta.last_edited_by} at {data.meta.last_edited_at}). Publish it from Pending changes.
        </Notice>
      )}
      {flash && <Notice tone={flash.tone}>{flash.text}</Notice>}

      <div className="card">
        <Field label="FG to edit" htmlFor="fg-pick" hint="Type part of the FG code or name, then click it. Use “New FG” to create one.">
          <div className="picker-row">
            <MultiCombo id="fg-pick" label="FG to edit" single value={[pick]}
              options={fgs.map((f) => f.code)}
              renderValue={(c) => (c === NEW ? "New FG" : `${c} — ${fgName_(c)}`)}
              onChange={([v]) => { if (!v) return; setPick(v); setFlash(null); resetFrom(v, data); }}
              placeholder="Search by FG code or name" />
            <Button variant={pick === NEW ? "primary" : "secondary"} onClick={() => { setPick(NEW); setFlash(null); resetFrom(NEW, data); }}><IPlus />New FG</Button>
          </div>
          <span className="muted">{pick === NEW ? "Creating a new FG — enter its code and name below." : `${fgs.length} FGs in the draft`}</span>
        </Field>
        <div className="fg-grid">
          <Field label="FG code" htmlFor="fg-code" hint="Stored upper-case without spaces. Changing it re-codes this FG.">
            <input id="fg-code" value={fgCode} onChange={(e) => setFgCode(e.target.value)} placeholder="e.g. FGC1234" />
          </Field>
          <Field label="FG name" htmlFor="fg-name">
            <input id="fg-name" value={fgName} onChange={(e) => setFgName(e.target.value)} placeholder="e.g. Celebration Box - 12pc" />
          </Field>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>PM lines <span className="muted">({lines.length})</span></h2>
          <span className="muted">Leave PM name blank to fill it from the PM code.</span>
        </div>
        {lines.length === 0 ? (
          <Empty title="No PM lines yet">Add the first packaging material for this FG.</Empty>
        ) : (
          <div className="table-wrap edit-wrap">
            <table className="table table--edit">
              <thead><tr>
                <th scope="col">PM code</th><th scope="col">PM name</th><th scope="col" className="num">Qty</th>
                <th scope="col">UOM</th><th scope="col" className="num">Rate</th><th scope="col" className="num">SOH (ERP)</th><th scope="col"><span className="sr-only">Remove</span></th>
              </tr></thead>
              <tbody>
                {lines.map((l) => {
                  const e = lineErr(l);
                  return (
                    <tr key={l.key} className={l.isNew ? "is-new" : ""}>
                      <td data-label="PM code"><input aria-label="PM code" className={e.pmCode ? "is-invalid" : ""} value={l.pmCode} onChange={(ev) => update(l.key, { pmCode: ev.target.value })} placeholder="PKG…" />{e.pmCode && <span className="field-error">{e.pmCode}</span>}</td>
                      <td data-label="PM name"><input aria-label="PM name" value={l.pmName} onChange={(ev) => update(l.key, { pmName: ev.target.value })} placeholder="Auto-fill from code" /></td>
                      <td data-label="Qty" className="num"><input aria-label="Qty" className={`num ${e.qty ? "is-invalid" : ""}`} inputMode="decimal" type="number" min={0} step={0.01} value={l.qty} onChange={(ev) => update(l.key, { qty: ev.target.value })} />{e.qty && <span className="field-error">{e.qty}</span>}</td>
                      <td data-label="UOM">
                        <select aria-label="UOM" value={l.uom} onChange={(ev) => update(l.key, { uom: ev.target.value })}>
                          <option value="">—</option>
                          {[...new Set([...UOM_OPTIONS, ...(l.uom ? [l.uom] : [])])].map((u) => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td data-label="Rate" className="num"><input aria-label="Rate" className={`num ${e.rate ? "is-invalid" : ""}`} inputMode="decimal" type="number" min={0} step="any" value={l.rate} onChange={(ev) => update(l.key, { rate: ev.target.value })} />{e.rate && <span className="field-error">{e.rate}</span>}</td>
                      <td data-label="SOH (ERP)" className={`num readonly ${l.soh === 0 ? "cell-bad" : ""}`}>{l.isNew ? "—" : sohFmt(l.soh)}</td>
                      <td><button className="icon-btn icon-btn--danger" aria-label={`Remove ${l.pmCode || "line"}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><ITrash /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Button variant="ghost" className="add-line" onClick={() => setLines((ls) => [...ls, { key: `l${seq++}`, rowId: null, pmCode: "", pmName: "", qty: "", uom: "", rate: "", soh: null, isNew: true }])}>
          <IPlus />Add PM line
        </Button>
      </section>

      {errors.length > 0 && (
        <Notice tone="error" title="Not saved">
          {errors.length === 1 ? errors[0] : <ul className="tight">{errors.map((x) => <li key={x}>{x}</li>)}</ul>}
        </Notice>
      )}

      <div className="action-bar">
        <Button variant="primary" busy={busy === "save"} disabled={!!busy} onClick={save}>Save to draft</Button>
        <Button variant="ghost" disabled={!!busy} onClick={() => { resetFrom(pick, data); setFlash(null); }}><IReset />Undo unsaved edits</Button>
        <span className="spacer" />
        {pick !== NEW && (confirmDelete ? (
          <span className="confirm">
            Remove {origCode} from the draft?
            <Button variant="danger" busy={busy === "delete"} onClick={del}>Delete FG</Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Keep</Button>
          </span>
        ) : (
          <Button variant="ghost" className="text-danger" onClick={() => setConfirmDelete(true)}><ITrash />Delete this FG</Button>
        ))}
      </div>
    </>
  );
}
