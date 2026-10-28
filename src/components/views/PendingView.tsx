"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../AppContext";
import { requestUnlock } from "../Shell";
import { ILock } from "../Icons";
import { DataTable } from "../DataTable";
import { Button, Empty, Field, Notice, PageHeader, Section, Spinner } from "../ui";
import { api } from "@/lib/client/api";
import type { DiffRow } from "@/lib/types";

type Pending = { hasDraft: false } | { hasDraft: true; meta: Record<string, string>; changes: DiffRow[]; masterMoved: boolean };

export function PendingView() {
  const { user } = useApp();
  const router = useRouter();
  const [data, setData] = useState<Pending | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"" | "publish" | "discard">("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await api<Pending>("/api/pending")); setErr(null); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { if (user) load(); }, [user, load]);

  if (!user) return <Notice tone="warn" title="This page is for the PM team" action={<Button variant="primary" onClick={() => requestUnlock("/pending", "Pending Changes")}><ILock />Enter password</Button>}>Enter the editor password to open Pending Changes.</Notice>;
  if (err) return <Notice tone="error" title="Couldn't load pending changes" action={<Button onClick={load}>Try again</Button>}>{err}</Notice>;
  if (!data) return <div className="loading-page"><Spinner label="Loading" /> Comparing draft with the live BOM…</div>;

  return (
    <>
      <PageHeader title="Pending changes" lede="Everything saved to the draft, compared line by line with the live BOM. Publishing backs up the current master first and logs each change to History." />
      {flash && <Notice tone="success">{flash}</Notice>}
      {!data.hasDraft ? (
        <Empty title="No pending changes">Edits saved to draft will appear here before they go live. <Link href="/edit">Edit the BOM</Link></Empty>
      ) : (
        <>
          {data.masterMoved && (
            <Notice tone="warn" title="The live BOM changed after this draft started">Someone else published since. Publishing will overwrite their changes — check the list below.</Notice>
          )}
          <Section title={<>{data.changes.length} change(s) across {new Set(data.changes.map((c) => c["FG Code"])).size} FG(s)</>}
            aside={<span className="muted">Draft started by {data.meta.started_by} at {data.meta.started_at}</span>}>
            {data.changes.length ? (
              <DataTable<DiffRow & Record<string, unknown>> caption="Pending changes" rows={data.changes as (DiffRow & Record<string, unknown>)[]} columns={[
                { key: "FG Code", label: "FG code" }, { key: "FG Name", label: "FG name" },
                { key: "Action", render: (r) => <span className={`action action--${r.Action.split(" ").pop()?.toLowerCase()}`}>{r.Action}</span> },
                { key: "PM Code", label: "PM code" }, { key: "PM Name", label: "PM name" }, { key: "Field" },
                { key: "Old Value", label: "Old value", cellClass: () => "cell-old" }, { key: "New Value", label: "New value", cellClass: () => "cell-new" },
              ]} />
            ) : <p className="muted">The draft matches the live BOM — there's nothing to publish.</p>}
          </Section>

          <div className="card">
            <Field label="Change note (optional)" htmlFor="note" hint="Saved with every change in History, e.g. why the PM was switched.">
              <input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Diwali 2026 box switch to PKG4342" />
            </Field>
            <div className="action-bar">
              <Button variant="primary" busy={busy === "publish"} disabled={!data.changes.length || !!busy} onClick={async () => {
                setBusy("publish");
                try {
                  const r = await api<{ changes: number; backup: string }>("/api/publish", { json: { note } });
                  setFlash(`Published ${r.changes} change(s).${r.backup ? ` Previous master backed up to ${r.backup}.` : ""}`);
                  setNote(""); await load(); router.refresh();
                } catch (e) { setErr((e as Error).message); } finally { setBusy(""); }
              }}>Publish (overwrite master)</Button>
              <span className="spacer" />
              {confirmDiscard ? (
                <span className="confirm">Throw away every unpublished edit?
                  <Button variant="danger" busy={busy === "discard"} onClick={async () => {
                    setBusy("discard");
                    try { await api("/api/draft/discard", { method: "POST" }); setFlash("Draft discarded."); await load(); router.refresh(); }
                    finally { setBusy(""); setConfirmDiscard(false); }
                  }}>Discard draft</Button>
                  <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>Keep</Button>
                </span>
              ) : <Button variant="ghost" className="text-danger" disabled={!!busy} onClick={() => setConfirmDiscard(true)}>Discard draft</Button>}
            </div>
          </div>
        </>
      )}
    </>
  );
}
