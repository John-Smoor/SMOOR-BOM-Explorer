"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useApp } from "../AppContext";
import { IAlert, IArrow, ICalc, IEdit, ILayers, IList, ILock, ISearch, ISwap } from "../Icons";
import { attachSoh } from "@/lib/bom/calc";
import { requestUnlock } from "../Shell";

const MODULES = [
  { href: "/search", title: "BOM Search", text: "Find the packaging bill of materials for any FG", icon: <ISearch /> },
  { href: "/order-check", title: "Order Check", text: "Add FGs and quantities, then check PM stock", icon: <ICalc /> },
  { href: "/edit", title: "Edit BOM", text: "Change PM lines for one FG at a time", icon: <IEdit />, editor: true },
  { href: "/pending", title: "Pending Changes", text: "Review and publish drafted changes", icon: <ISwap />, editor: true },
];

export function HomeView() {
  const { master, soh, user } = useApp();
  // same figures BOM Search shows with no search applied
  const stats = useMemo(() => {
    const view = attachSoh(master, soh);
    return { fgs: new Set(master.map((r) => r.fgCode)).size, lines: master.length, zero: view.filter((r) => r.sohTotal === 0).length };
  }, [master, soh]);

  return (
    <>
      <section className="hero">
        <picture>
          <source media="(max-width: 700px)" srcSet="/hero-sm.jpg" />
          <img src="/hero.jpg" alt="" className="hero-img" />
        </picture>
        <div className="hero-in">
          <h1>BOM Explorer</h1>
          <p>Search, order, edit and manage BOMs efficiently.</p>
          <div className="hero-cta">
            <Link href="/search" className="btn hero-btn hero-btn--solid">Get Started <IArrow /></Link>
            <Link href="/history" className="btn hero-btn hero-btn--ghost">View Recent Activity</Link>
          </div>
        </div>
      </section>

      <section className="home-panel" aria-labelledby="km">
        <h2 id="km">Key Modules</h2>
        <div className="modules">
          {MODULES.map((m) => {
            const locked = m.editor && !user;
            return (
              <Link key={m.href} href={m.href} onClick={locked ? (e) => { e.preventDefault(); requestUnlock(m.href, m.title); } : undefined} className={`module ${locked ? "is-locked" : ""}`}>
                <span className="module-icon">{m.icon}</span>
                <b>{m.title}</b>
                <span>{m.text}</span>
                {locked && <span className="module-lock"><ILock /> PM team only</span>}
              </Link>
            );
          })}
        </div>
        <div className="home-stats">
          <div className="hs"><span className="hs-icon"><IList /></span><div><span>FGs</span><b>{stats.fgs.toLocaleString("en-IN")}</b></div></div>
          <div className="hs"><span className="hs-icon"><ILayers /></span><div><span>BOM Lines</span><b>{stats.lines.toLocaleString("en-IN")}</b></div></div>
          <div className="hs hs--bad"><span className="hs-icon"><IAlert /></span><div><span>PM Lines with Zero SOH</span><b>{stats.zero.toLocaleString("en-IN")}</b></div></div>
        </div>
      </section>
    </>
  );
}
