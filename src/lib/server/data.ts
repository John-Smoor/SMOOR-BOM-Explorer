import { cleanCode, dataWarnings, diff, normalizeRows, replaceFgIn, validate } from "../bom/core";
import { pmNameLookup } from "../bom/calc";
import type { BomRow, SohData } from "../types";
import * as S from "./store";
import { imageMap } from "./images";

// mtime-keyed caches (same idea as @st.cache_data keyed on master_version / SOH mtime)
let masterCache: { v: string; rows: BomRow[] } | null = null;
let catCache: { v: string; map: Record<string, string> } | null = null;
let sohCache: { v: string; data: SohData } | null = null;

export async function master(): Promise<BomRow[]> {
  const v = await S.masterVersion();
  if (!masterCache || masterCache.v !== v) masterCache = { v, rows: await S.loadMaster() };
  return masterCache.rows;
}

export async function soh(): Promise<SohData> {
  const v = await S.sohVersion();
  if (!sohCache || sohCache.v !== v) sohCache = { v, data: await S.loadSoh() };
  return sohCache.data;
}

/** SOH limited to the given item codes (keeps the client payload small; lookups are by code only). */
export function trimSoh(data: SohData, codes: Set<string>): SohData {
  return {
    ...data,
    // an SOH file with no rows behaves as "not pulled" (pandas .empty) — no warehouse columns either
    whCols: data.items.length ? data.whCols : [],
    items: data.items.filter((i) => codes.has(i.itemCode)),
  };
}

async function categories() {
  const v = await S.masterVersion();
  if (!catCache || catCache.v !== v) catCache = { v, map: await S.loadCategories() };
  return catCache.map;
}

export interface AppData {
  master: BomRow[];
  soh: SohData;
  sohCount: number;
  hasDraft: boolean;
  images: Record<string, string>;
  /** FG code -> Category (empty when the master has no Category column) */
  categories: Record<string, string>;
}

export async function appData(): Promise<AppData> {
  const [m, s] = [await master(), await soh()];
  const codes = new Set(m.map((r) => r.pmCode));
  const draftExists = await S.hasDraft();
  if (draftExists) for (const r of await S.loadDraft()) codes.add(r.pmCode);
  return { master: m, soh: trimSoh(s, codes), sohCount: s.items.length, hasDraft: draftExists, images: await imageMap(m), categories: await categories() };
}

export async function editorData() {
  const draft = await S.loadDraft();
  const s = await soh();
  return {
    draft,
    soh: trimSoh(s, new Set(draft.map((r) => r.pmCode))),
    warnings: dataWarnings(draft),
    hasDraft: await S.hasDraft(),
    meta: await S.draftMeta(),
  };
}

export async function pendingData() {
  if (!(await S.hasDraft())) return { hasDraft: false as const };
  const meta = await S.draftMeta();
  const changes = diff(await S.loadMaster(), await S.loadDraft());
  return {
    hasDraft: true as const,
    meta,
    changes,
    masterMoved: !!meta.base_master_version && meta.base_master_version !== (await S.masterVersion()),
  };
}

export interface EditedLine {
  rowId: string | null;
  pmCode: string | null;
  pmName: string | null;
  qty: number | null;
  uom: string | null;
  rate: number | null;
}

/** "💾 Save to draft" handler from app.py. Returns problems (empty = saved). */
export async function saveFg(user: string, origCode: string, fgCode: string, fgName: string, edited: EditedLine[]): Promise<string[]> {
  const draft = await S.loadDraft();
  const lk = pmNameLookup(await master(), await soh());
  const newLines = edited.map((l) => {
    const pmCode = cleanCode(l.pmCode);
    const blank = l.pmName === null || l.pmName === undefined || String(l.pmName).trim() === "";
    return {
      fgCode, fgName, pmCode,
      pmName: blank ? (lk.get(pmCode) ?? null) : l.pmName,
      qty: l.qty, uom: l.uom, rate: l.rate, rowId: l.rowId ?? undefined,
    } as Partial<BomRow>;
  });
  const newCode = cleanCode(fgCode);
  const problems: string[] = [];
  if (!newCode || !fgName.trim()) problems.push("FG code and FG name are required.");
  if (newCode !== origCode && draft.some((r) => r.fgCode === newCode)) problems.push(`${newCode} already exists — pick it from the list to edit it.`);
  const updated = replaceFgIn(draft, origCode || newCode, newLines as BomRow[]);
  problems.push(...validate(updated, [newCode]));
  if (!problems.length) await S.saveDraft(updated, user);
  return problems;
}

export async function deleteFg(user: string, code: string) {
  const draft = await S.loadDraft();
  await S.saveDraft(draft.filter((r) => r.fgCode !== code), user);
}

export { normalizeRows };
