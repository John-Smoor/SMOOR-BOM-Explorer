"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "./AppContext";
import { Button, Notice } from "./ui";
import { api } from "@/lib/client/api";
import { IBell, ICalc, IClock, IClose, IEdit, IEye, IEyeOff, IHistory, ILock, IMenu, IRefresh, ISearch, IUpload } from "./Icons";

const NAV = [
  { href: "/search", label: "BOM Search", icon: <ISearch /> },
  { href: "/order-check", label: "Order Check", icon: <ICalc /> },
  { href: "/edit", label: "Edit BOM", icon: <IEdit />, editor: true },
  { href: "/pending", label: "Pending Changes", icon: <IClock />, editor: true },
  { href: "/history", label: "History", icon: <IHistory /> },
];

/** Popover that closes on outside click / Escape. */
function Pop({ open, onClose, children, label, className = "" }: { open: boolean; onClose: () => void; children: ReactNode; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open, onClose]);
  if (!open) return null;
  return <div ref={ref} className={`pop ${className}`} role="dialog" aria-label={label}>{children}</div>;
}

export function Shell({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  const [pop, setPop] = useState<"" | "bell" | "user">("");
  const path = usePathname();
  const { user, hasDraft, soh } = useApp();
  useEffect(() => { setMenu(false); setPop(""); }, [path]);
  const close = () => setPop("");
  const alerts = (user && hasDraft ? 1 : 0) + (!soh.meta.fetched_at ? 1 : 0);
  const isHome = path === "/";

  return (
    <div className={`app ${isHome ? "app--home" : ""}`}>
      <a href="#main" className="skip">Skip to content</a>
      <header className="topnav">
        <div className="topnav-in">
          <button className="icon-btn topnav-burger" aria-label="Open menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>{menu ? <IClose /> : <IMenu />}</button>
          <Link href="/" className="brand" aria-label="SMOOR BOM Explorer home">
            <img src="/smoor-mark.png" alt="" width={34} height={34} />
            <span className="brand-word">SMOOR</span>
          </Link>
          <nav className={`topnav-links ${menu ? "is-open" : ""}`} aria-label="Main navigation">
            {NAV.map((n) => {
              const active = path.startsWith(n.href);
              const locked = n.editor && !user;
              return (
                <Link key={n.href} href={n.href} onClick={locked ? (e) => { e.preventDefault(); setMenu(false); requestUnlock(n.href, n.label); } : undefined} className={`tn-link ${active ? "is-active" : ""} ${locked ? "is-locked" : ""}`} aria-current={active ? "page" : undefined}
                  title={locked ? "PM team only — click to enter the password" : undefined}>
                  {n.icon}<span>{n.label}</span>
                  {locked && <ILock />}
                  {n.href === "/pending" && user && hasDraft && <span className="nav-dot" aria-label="draft waiting" />}
                </Link>
              );
            })}
          </nav>
          <div className="topnav-tools">
            <div className="tool">
              <button className="tool-btn" aria-label={`Stock & alerts${alerts ? ` (${alerts})` : ""}`} aria-expanded={pop === "bell"} onClick={() => setPop(pop === "bell" ? "" : "bell")}>
                <IBell />{alerts > 0 && <span className="tool-badge">{alerts}</span>}
              </button>
              <Pop open={pop === "bell"} onClose={close} label="Stock and alerts">
                {user && hasDraft && (
                  <Link href="/pending" className="alert-row"><IClock /><span><b>Draft waiting to be published</b><br />Review it in Pending changes</span></Link>
                )}
                <SohPanel />
              </Pop>
            </div>
            <div className="tool">
              <button className={`avatar ${user ? "is-editor" : ""}`} aria-label={user ? `Signed in as ${user}` : "Access"} aria-expanded={pop === "user"} onClick={() => setPop(pop === "user" ? "" : "user")}>
                {user ? user.trim()[0].toUpperCase() : <ILock />}
              </button>
              <Pop open={pop === "user"} onClose={close} label="Access">
                <AccessPanel />
              </Pop>
            </div>
          </div>
        </div>
      </header>
      <UnlockModal />
      <main id="main" className={isHome ? "main-home" : "main"}>{children}</main>
    </div>
  );
}

/** Ask any component to open the password prompt, then go to `href` once unlocked. */
export const requestUnlock = (href: string, label: string) =>
  window.dispatchEvent(new CustomEvent("smoor:unlock", { detail: { href, label } }));

/** Editor password + name form. Server checks the password; on success goes to `target`. */
function UnlockForm({ target, onDone, autoFocus }: { target: string; onDone?: () => void; autoFocus?: boolean }) {
  const router = useRouter();
  const [pwd, setPwd] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  return (
    <form className="panel-form" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setErr(null);
      try { await api("/api/auth", { json: { password: pwd, name } }); setPwd(""); onDone?.(); router.push(target); router.refresh(); }
      catch (x) { setErr((x as Error).message); }
      finally { setBusy(false); }
    }}>
      <div className="pwd">
        <input type={showPwd ? "text" : "password"} placeholder="Editor password" aria-label="Editor password" value={pwd} autoFocus={autoFocus}
          onChange={(e) => { setPwd(e.target.value); setErr(null); }} autoComplete="current-password" aria-invalid={!!err} />
        <button type="button" className="pwd-toggle" aria-label={showPwd ? "Hide password" : "Show password"} aria-pressed={showPwd} onClick={() => setShowPwd((v) => !v)}>
          {showPwd ? <IEyeOff /> : <IEye />}<span>{showPwd ? "Hide" : "Show"}</span>
        </button>
      </div>
      <input placeholder="Your name" aria-label="Your name" value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} autoComplete="name" />
      {err && <p className="panel-error" role="alert">{err}</p>}
      <Button variant="primary" busy={busy} type="submit" className="on-dark">Unlock & continue</Button>
    </form>
  );
}

/** Password prompt opened by clicking a locked page (nav link, home card, or locked page notice). */
function UnlockModal() {
  const [req, setReq] = useState<{ href: string; label: string } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setReq((e as CustomEvent).detail);
    window.addEventListener("smoor:unlock", on);
    return () => window.removeEventListener("smoor:unlock", on);
  }, []);
  useEffect(() => {
    if (!req) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setReq(null);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [req]);
  if (!req) return null;
  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && setReq(null)}>
      <div className="unlock-modal" role="dialog" aria-modal="true" aria-labelledby="ul-title">
        <button className="modal-x" aria-label="Close" onClick={() => setReq(null)}><IClose /></button>
        <img src="/smoor-mark.png" alt="SMOOR" width={64} height={64} className="unlock-logo" />
        <h2 id="ul-title">PM team access</h2>
        <p>Enter the editor password to open <b>{req.label}</b>.</p>
        <UnlockForm target={req.href} onDone={() => setReq(null)} autoFocus />
      </div>
    </div>
  );
}

function AccessPanel() {
  const { user } = useApp();
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit">("view");

  if (user) {
    return (
      <div className="panel">
        <div className="panel-row">
          <span className="panel-title">Editing as <b>{user}</b></span>
          <Button variant="ghost" className="btn--sm on-dark" onClick={async () => { await api("/api/auth", { method: "DELETE" }); setMode("view"); router.push("/"); router.refresh(); }}>
            <ILock /> Lock
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="panel">
      <div className="seg" role="radiogroup" aria-label="Access">
        {(["view", "edit"] as const).map((m) => (
          <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? "is-on" : ""} onClick={() => setMode(m)}>
            {m === "view" ? "View" : "Edit (PM team)"}
          </button>
        ))}
      </div>
      {mode === "edit" && <UnlockForm target="/edit" autoFocus />}
    </div>
  );
}

function SohPanel() {
  const { soh, sohCount } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "erp" | "file">("");
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  return (
    <div className="panel">
      <div className="panel-title">ERP stock <span className="muted-dark">DryStock Balance</span></div>
      <p className="panel-meta">
        {soh.meta.fetched_at ? <>Pulled {soh.meta.fetched_at}<br />via {soh.meta.source} · {sohCount.toLocaleString("en-IN")} items</> : "Not pulled yet"}
      </p>
      <Button className="on-dark w-full" busy={busy === "erp"} disabled={!!busy} onClick={async () => {
        setBusy("erp"); setMsg(null);
        try { const r = await api<{ source: string }>("/api/soh/refresh", { method: "POST" }); setMsg({ tone: "success", text: `Updated via ${r.source}` }); router.refresh(); }
        catch (e) { setMsg({ tone: "error", text: (e as Error).message }); }
        finally { setBusy(""); }
      }}>
        {busy !== "erp" && <IRefresh />}{busy === "erp" ? "Pulling DryStock… (can take a minute)" : "Refresh SOH from ERP"}
      </Button>
      <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); setMsg(null); }} />
      {!file ? (
        <button className="link-btn" onClick={() => fileRef.current?.click()}><IUpload /> …or upload a DryStock export (.xlsx)</button>
      ) : (
        <div className="file-pick">
          <span title={file.name}>{file.name}</span>
          <Button className="btn--sm on-dark" busy={busy === "file"} disabled={!!busy} onClick={async () => {
            setBusy("file"); setMsg(null);
            const fd = new FormData(); fd.append("file", file);
            try { await api("/api/soh/upload", { method: "POST", body: fd }); setMsg({ tone: "success", text: "SOH updated from file" }); setFile(null); router.refresh(); }
            catch (e) { setMsg({ tone: "error", text: (e as Error).message }); }
            finally { setBusy(""); }
          }}>Use uploaded file</Button>
          <button className="link-btn" onClick={() => setFile(null)}>Cancel</button>
        </div>
      )}
      {msg && <div className="panel-msg"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
    </div>
  );
}
