/** Port of erp_soh.py API fetch (Frappe frappe.desk.query_report.run) + refresh_soh. */
import { drystockToSoh, reportToTable } from "../soh/drystock";
import type { Table } from "../types";
import { saveSoh } from "./store";

const BASE = () => process.env.ERP_BASE_URL || "https://qa-erp.smoorchocolate.com";
const REPORT = () => process.env.ERP_DRYSTOCK_REPORT || "DryStock Balance";
const FILTERS: Record<string, unknown> = {}; // add report filters here if the report needs any (e.g. company)

class Session {
  headers: Record<string, string> = { Accept: "application/json" };
  cookies = new Map<string, string>();
  async req(method: string, url: string, body?: { json?: unknown; form?: Record<string, string> }, timeoutS = 30) {
    const h: Record<string, string> = { ...this.headers };
    if (this.cookies.size) h.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    let payload: string | undefined;
    if (body?.json !== undefined) { h["Content-Type"] = "application/json"; payload = JSON.stringify(body.json); }
    if (body?.form) { h["Content-Type"] = "application/x-www-form-urlencoded"; payload = new URLSearchParams(body.form).toString(); }
    const r = await fetch(url, { method, headers: h, body: payload, signal: AbortSignal.timeout(timeoutS * 1000) });
    for (const c of r.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      if (i > 0) this.cookies.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
    }
    if (!r.ok) throw new Error(`${r.status} ${r.statusText} for url: ${url}`);
    return r;
  }
}

async function session() {
  const s = new Session();
  const { ERP_API_KEY: key, ERP_API_SECRET: secret, ERP_EMAIL: email, ERP_PASSWORD: pwd } = process.env;
  if (key && secret) s.headers.Authorization = `token ${key}:${secret}`;
  else if (email && pwd) await s.req("POST", `${BASE()}/api/method/login`, { form: { usr: email, pwd } });
  else throw new Error("No ERP credentials. Set ERP_API_KEY/ERP_API_SECRET (or ERP_EMAIL/ERP_PASSWORD).");
  return s;
}

async function runReport(s: Session, ignorePrepared: boolean) {
  const r = await s.req("POST", `${BASE()}/api/method/frappe.desk.query_report.run`,
    { json: { report_name: REPORT(), filters: FILTERS, ignore_prepared_report: ignorePrepared } }, 300);
  return ((await r.json()).message || {}) as { columns?: unknown[]; result?: unknown[]; prepared_report?: unknown };
}

export async function fetchDrystockApi(pollTimeoutS = 300): Promise<Table> {
  const s = await session();
  let msg = await runReport(s, true);
  if (!msg.result?.length && msg.prepared_report) {
    const q = await s.req("POST", `${BASE()}/api/method/frappe.desk.query_report.background_enqueue_run`,
      { json: { report_name: REPORT(), filters: FILTERS } }, 60);
    const prName = ((await q.json()).message || {}).name as string | undefined;
    const end = Date.now() + pollTimeoutS * 1000;
    while (prName && Date.now() < end) {
      const st = ((await (await s.req("GET", `${BASE()}/api/resource/Prepared Report/${prName}`)).json()).data || {}) as Record<string, string>;
      if (st.status === "Completed") break;
      if (st.status === "Error") throw new Error(`ERP prepared report failed: ${st.error_message}`);
      await new Promise((res) => setTimeout(res, 5000));
    }
    msg = await runReport(s, false);
  }
  const t = reportToTable(msg);
  if (!t.rows.length) throw new Error("ERP returned no rows for DryStock Balance.");
  return t;
}

/** Pull fresh DryStock and cache it. Returns the source used. */
export async function refreshSoh(): Promise<string> {
  const errors: string[] = [];
  try {
    await saveSoh(drystockToSoh(await fetchDrystockApi()), "api");
    return "api";
  } catch (e) {
    errors.push(`api: ${(e as Error).message}`);
  }
  // The Selenium fallback (pm_pipeline.py) stays in the Python toolkit: run `python erp_soh.py` on a schedule.
  errors.push("selenium: not available in the web app — run `python erp_soh.py` or upload a DryStock export");
  throw new Error(errors.join(" | "));
}
