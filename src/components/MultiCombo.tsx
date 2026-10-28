"use client";
import { useId, useMemo, useRef, useState } from "react";

/**
 * Type-ahead picker (Streamlit multiselect / selectbox equivalent).
 * - Enter adds only the item that is highlighted (after typing or using the arrow keys) — never anything else.
 * - Picking an item closes the list, so the buttons below stay visible.
 * - allowFreeText = accept_new_options: Enter with no highlighted match adds the typed text as its own pick.
 * - single: one value, the chip is replaced (used for "FG to edit").
 */
export function MultiCombo({ options, value, onChange, placeholder, allowFreeText, label, id: idProp, maxShown = 60, single, renderValue }: {
  options: string[]; value: string[]; onChange: (v: string[]) => void; placeholder?: string;
  allowFreeText?: boolean; label: string; id?: string; maxShown?: number; single?: boolean; renderValue?: (v: string) => string;
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1); // nothing highlighted until the user types or presses an arrow key
  const inputRef = useRef<HTMLInputElement>(null);
  const chosen = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = options.filter((o) => (single || !chosen.has(o)) && terms.every((t) => (renderValue ? renderValue(o) : o).toLowerCase().includes(t)));
    return { total: list.length, shown: list.slice(0, maxShown) };
  }, [options, q, chosen, maxShown, single, renderValue]);

  const close = () => { setOpen(false); setActive(-1); };
  const add = (v: string) => {
    if (!v.trim()) return;
    if (single) onChange([v]);
    else if (!chosen.has(v)) onChange([...value, v]);
    setQ("");
    close();
  };
  const freeText = allowFreeText && q.trim() && !options.includes(q) ? q : null;
  const rows = filtered.shown.map((v) => ({ kind: "opt" as const, v }));
  const show = (v: string) => (renderValue ? renderValue(v) : v);

  return (
    <div className={`combo ${open ? "is-open" : ""} ${single ? "combo--single" : ""}`} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) close(); }}>
      <div className="combo-box" onClick={() => { inputRef.current?.focus(); setOpen(true); }}>
        <svg className="combo-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        {!single && value.map((v) => (
          <span key={v} className={`chip ${options.includes(v) ? "" : "chip--free"}`}>
            <span className="chip-text" title={v}>{options.includes(v) ? show(v) : `“${v}”`}</span>
            <button type="button" aria-label={`Remove ${v}`} onClick={(e) => { e.stopPropagation(); onChange(value.filter((x) => x !== v)); }}>×</button>
          </span>
        ))}
        <input
          ref={inputRef} id={id} value={q} placeholder={single ? (value[0] ? show(value[0]) : placeholder) : value.length ? "Add another…" : placeholder}
          aria-label={label} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
          className={single && value[0] && !q ? "has-value" : ""}
          aria-activedescendant={open && active >= 0 ? `${id}-o${active}` : undefined}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(e.target.value.trim() && !allowFreeText ? 0 : -1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, rows.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") {
              e.preventDefault();
              if (open && active >= 0 && rows[active]) add(rows[active].v);
              else if (freeText) add(freeText);
            }
            else if (e.key === "Escape" || e.key === "Tab") close();
            else if (e.key === "Backspace" && !q && value.length && !single) onChange(value.slice(0, -1));
          }}
        />
        {!single && value.length > 0 && (
          <button type="button" className="combo-clear" aria-label="Clear all" onClick={(e) => { e.stopPropagation(); onChange([]); }}>Clear</button>
        )}
      </div>
      {open && (
        <div className="combo-pop">
          <ul className="combo-list" id={`${id}-list`} role="listbox" aria-label={label}>
            {freeText && (
              <li className="combo-free" onMouseDown={(e) => { e.preventDefault(); add(freeText); }}>
                Search for “{freeText}” <kbd>Enter</kbd>
              </li>
            )}
            {rows.map((r, i) => (
              <li key={r.v} id={`${id}-o${i}`} role="option" aria-selected={i === active || (single && value[0] === r.v)}
                className={`${i === active ? "is-active" : ""} ${single && value[0] === r.v ? "is-current" : ""}`}
                onMouseDown={(e) => { e.preventDefault(); add(r.v); }} onMouseEnter={() => setActive(i)}>
                {show(r.v)}
              </li>
            ))}
            {!rows.length && !freeText && <li className="combo-none">No matches — check the code or name</li>}
            {filtered.total > filtered.shown.length && <li className="combo-none">{filtered.total - filtered.shown.length} more — keep typing to narrow down</li>}
          </ul>
          <div className="combo-foot">
            <span>{single ? "Click an item to select it" : "Click items to add them · Enter adds the highlighted one"}</span>
            <button type="button" className="btn btn--primary btn--sm" onMouseDown={(e) => { e.preventDefault(); close(); inputRef.current?.blur(); }}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
