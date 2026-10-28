/* Compares the TypeScript port against the Python reference JSON. Usage: npx tsx parity/compare.ts parity/out/py.json */
import fs from "node:fs";
import { attachSoh, fgSummary, orderCheck, search, suggestions, viewColumns, viewRecord } from "../src/lib/bom/calc";
import { dataWarnings, diff, fmtVal, normalize, replaceFgIn, validate } from "../src/lib/bom/core";
import { drystockToSoh } from "../src/lib/soh/drystock";
import { fmtFixed, fmtG, kahanSum, npRound, npSum } from "../src/lib/num";
import { loadMaster, loadSoh } from "../src/lib/server/store";
import type { SearchField } from "../src/lib/config";

const ref = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
let fails = 0, checks = 0;
const eq = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => eq(x, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a), kb = Object.keys(b);
    return eq(ka, kb) && ka.every((k) => eq((a as any)[k], (b as any)[k]));
  }
  return false;
};
function check(name: string, ts: unknown, py: unknown) {
  checks++;
  if (!eq(ts, py)) {
    fails++;
    if (fails <= 25) {
      let a: any = ts, b: any = py;
      if (Array.isArray(a) && Array.isArray(b)) { const i = a.findIndex((x: any, k: number) => !eq(x, b[k])); a = [i, a[i], a.length]; b = [i, b[i], b.length]; }
      console.log("MISMATCH", name, "\n  ts:", JSON.stringify(a).slice(0, 500), "\n  py:", JSON.stringify(b).slice(0, 500));
    }
  }
}

(async () => {
  const m = await loadMaster();
  check("load master", m, ref.loaded_master);
  const s = await loadSoh();
  check("load soh items", s.items, ref.loaded_soh.items);
  check("load soh cols", [s.whCols, s.hasNameCol, s.meta], [ref.loaded_soh.whCols, ref.loaded_soh.hasNameCol, ref.loaded_soh.meta]);

  for (const ds of ref.datasets) {
    const master = ds.master, soh = ds.soh;
    for (const f of Object.keys(ds.suggestions)) {
      const sg = suggestions(master, f as SearchField);
      check(`${ds.name} sugg ${f}`, [...sg.values()].map((v) => [v.label, v.col === "fg" ? "Final FG Code" : "ERP packed code", v.value]), ds.suggestions[f]);
    }
    ds.search.forEach((c: any, i: number) => {
      const sg = suggestions(master, c.field);
      const res = search(master, c.field, c.picks, sg, c.full);
      check(`${ds.name} search#${i} rows`, res.map((r) => r.rowId), c.rowIds);
      const view = attachSoh(res, soh);
      const cols = viewColumns(soh, c.split);
      const recs = view.map((r) => viewRecord(r, soh, c.split));
      check(`${ds.name} search#${i} view`, recs.map((r) => cols.map((k) => r[k])), c.view.map((r: any) => cols.map((k) => r[k])));
      check(`${ds.name} search#${i} cols`, cols, c.view.length ? Object.keys(c.view[0]) : cols);
      check(`${ds.name} search#${i} metrics`, [view.filter((r) => r.sohTotal === 0).length, new Set(view.map((r) => r.fgCode)).size], [c.zeroSoh, c.nFg]);
      check(`${ds.name} search#${i} fgsum`, fgSummary(attachSoh(res, soh)), c.fgSummary);
    });
    ds.order.forEach((c: any, i: number) => {
      const r = orderCheck(master, c.order, soh);
      check(`${ds.name} order#${i} fg`, r.fg, c.fg);
      check(`${ds.name} order#${i} pm`, r.pm, c.pm);
      check(`${ds.name} order#${i} lines`, r.lines, c.lines);
    });
  }
  ref.diff.forEach((c: any, i: number) => {
    check(`diff#${i}`, diff(c.old, c.new), c.diff);
    check(`validate#${i}`, validate(c.new, [c.replaceFg]), c.validate);
    check(`validateAll#${i}`, validate(c.new), c.validateAll);
    check(`warnings#${i}`, dataWarnings(c.new), c.warnings);
    check(`replace#${i}`, replaceFgIn(c.new, c.replaceFg, c.replaceRows), c.replaced);
  });
  check("normalize", normalize(ref.normalize.input), ref.normalize.output);
  ref.drystock.forEach((c: any, i: number) => {
    const out = drystockToSoh({ columns: c.columns, rows: c.rows });
    check(`drystock#${i}`, [out.items, out.whCols, out.hasNameCol], [c.out.items, c.out.whCols, c.out.hasNameCol]);
  });
  for (const f of ref.fmt) {
    check(`fmt ${f.x}`, [fmtG(f.x), fmtFixed(f.x, 2), fmtFixed(f.x, 0, true), fmtFixed(f.x, 1), npRound(f.x, 1), npRound(f.x, 2), fmtVal(f.x)],
      [f.g, f.f2, f.f0, f.f1, f.r1, f.r2, f.fmt]);
  }
  for (const s2 of ref.sums) check(`sum n=${s2.a.length}`, [npSum(s2.a), kahanSum(s2.a)], [s2.series, s2.grp]);
  console.log(`${checks - fails}/${checks} checks identical, ${fails} mismatches`);
  process.exit(fails ? 1 : 0);
})();
