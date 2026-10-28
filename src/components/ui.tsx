"use client";
import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

export function Button({ variant = "secondary", busy, children, className = "", ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; busy?: boolean }) {
  return (
    <button {...p} className={`btn btn--${variant} ${className}`} disabled={p.disabled || busy} aria-busy={busy || undefined}>
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export const Spinner = ({ label }: { label?: string }) => (
  <span className="spinner" role={label ? "status" : undefined} aria-label={label} />
);

export function Notice({ tone = "info", title, children, action }: { tone?: "info" | "warn" | "error" | "success"; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`notice notice--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <div className="notice-body">
        {title && <strong className="notice-title">{title}</strong>}
        {children && <div>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Metric({ label, value, tone, hint }: { label: string; value: ReactNode; tone?: "bad" | "good"; hint?: string }) {
  return (
    <div className={`metric ${tone ? `metric--${tone}` : ""}`}>
      <span className="metric-label">{label}{hint && <Hint text={hint} />}</span>
      <span className="metric-value">{value}</span>
    </div>
  );
}

export function Hint({ text }: { text: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="hint">
      <button type="button" className="hint-btn" aria-describedby={id} aria-label="More info"
        onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}>i</button>
      <span id={id} role="tooltip" className={`hint-pop ${open ? "is-open" : ""}`}>{text}</span>
    </span>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden><span className="toggle-thumb" /></span>
      <span className="toggle-label">{label}</span>
      {hint && <Hint text={hint} />}
    </label>
  );
}

export function Field({ label, hint, children, htmlFor, error }: { label: string; hint?: string; children: ReactNode; htmlFor?: string; error?: string }) {
  return (
    <div className={`field ${error ? "field--error" : ""}`}>
      <label className="field-label" htmlFor={htmlFor}>{label}{hint && <Hint text={hint} />}</label>
      {children}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

export function PageHeader({ title, lede, actions }: { title: string; lede?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Section({ title, aside, children, collapsible, defaultOpen = true }:
  { title: ReactNode; aside?: ReactNode; children: ReactNode; collapsible?: boolean; defaultOpen?: boolean }) {
  if (collapsible) {
    return (
      <details className="section section--collapsible" open={defaultOpen}>
        <summary className="section-head"><h2>{title}</h2>{aside}</summary>
        <div className="section-body">{children}</div>
      </details>
    );
  }
  return (
    <section className="section">
      <div className="section-head"><h2>{title}</h2>{aside}</div>
      <div className="section-body">{children}</div>
    </section>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <svg width="44" height="44" viewBox="0 0 40 40" aria-hidden>
        <rect x="6" y="6" width="12.5" height="12.5" rx="3" fill="var(--line)" />
        <rect x="21.5" y="6" width="12.5" height="12.5" rx="3" fill="var(--line)" />
        <rect x="6" y="21.5" width="12.5" height="12.5" rx="3" fill="var(--line)" />
        <rect x="21.5" y="21.5" width="12.5" height="12.5" rx="3" fill="none" stroke="var(--line)" strokeDasharray="3 2" />
      </svg>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function StatusBadge({ value }: { value: string }) {
  const tone = value.startsWith("✅") ? "good" : value.startsWith("❌") ? "bad" : value.startsWith("⚠") ? "warn" : "neutral";
  const text = value.replace(/^(✅|❌|⚠️|⚠)\s*/u, "");
  return <span className={`badge badge--${tone}`}>{text}</span>;
}
