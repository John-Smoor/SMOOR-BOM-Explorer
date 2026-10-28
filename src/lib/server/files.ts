/**
 * File storage for the Excel files and FG images.
 *  - On Netlify  → Netlify Blobs (store "bom-data"), because Netlify's server disk is wiped after every request.
 *  - Elsewhere   → the local data folder (./data or BOM_DATA_DIR), exactly as before.
 * Keys are paths relative to the data folder: "BOM_Master.xlsx", "backups/…", "fg-images/FGC0984.png".
 */
import fs from "node:fs";
import path from "node:path";
import { pyFloatRepr } from "../num";

export const DATA_DIR = process.env.BOM_DATA_DIR || path.join(process.cwd(), "data");
export const BLOB_STORE = process.env.BOM_BLOB_STORE || "bom-data";

export const usingBlobs = () =>
  process.env.BOM_STORAGE === "blobs" ||
  (process.env.BOM_STORAGE !== "local" && !!(process.env.NETLIFY_BLOBS_CONTEXT || process.env.NETLIFY === "true"));

export interface FileInfo { key: string; version: string }

interface Backend {
  read(key: string): Promise<Buffer | null>;
  write(key: string, data: Buffer): Promise<void>;
  remove(key: string): Promise<void>;
  /** changes whenever the file is rewritten; "0" when it doesn't exist */
  version(key: string): Promise<string>;
  list(prefix: string): Promise<FileInfo[]>;
}

// ── local disk ───────────────────────────────────────────────────────────
const local: Backend = {
  async read(key) {
    const p = path.join(DATA_DIR, key);
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
  },
  async write(key, data) {
    const p = path.join(DATA_DIR, key);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = `${p}.tmp`;
    fs.writeFileSync(tmp, data); // temp file + rename so readers never see a half-written file
    fs.renameSync(tmp, p);
  },
  async remove(key) {
    const p = path.join(DATA_DIR, key);
    if (fs.existsSync(p)) fs.rmSync(p);
  },
  async version(key) {
    const p = path.join(DATA_DIR, key);
    if (!fs.existsSync(p)) return "0";
    const st = fs.statSync(p, { bigint: true }); // str(os.path.getmtime(p)) — matches the Streamlit app
    return pyFloatRepr(Number(st.mtimeNs / 1_000_000_000n) + 1e-9 * Number(st.mtimeNs % 1_000_000_000n));
  },
  async list(prefix) {
    const dir = path.join(DATA_DIR, prefix);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((f) => fs.statSync(path.join(dir, f)).isFile())
      .map((f) => ({ key: path.posix.join(prefix, f), version: String(Math.round(fs.statSync(path.join(dir, f)).mtimeMs)) }));
  },
};

// ── Netlify Blobs ────────────────────────────────────────────────────────
async function blobStore() {
  const { getStore } = await import("@netlify/blobs");
  return getStore({ name: BLOB_STORE, consistency: "strong" });
}

const blobs: Backend = {
  async read(key) {
    const ab = await (await blobStore()).get(key, { type: "arrayBuffer" });
    return ab ? Buffer.from(ab) : null;
  },
  async write(key, data) {
    const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    await (await blobStore()).set(key, ab, { metadata: { mtime: Date.now() } });
  },
  async remove(key) {
    await (await blobStore()).delete(key);
  },
  async version(key) {
    const m = await (await blobStore()).getMetadata(key);
    if (!m) return "0";
    return String((m.metadata as { mtime?: number })?.mtime ?? m.etag ?? "1");
  },
  async list(prefix) {
    const { blobs: items } = await (await blobStore()).list({ prefix: prefix.endsWith("/") ? prefix : `${prefix}/` });
    return items.map((b) => ({ key: b.key, version: b.etag }));
  },
};

const be = (): Backend => (usingBlobs() ? blobs : local);

export const readFile = (key: string) => be().read(key);
export const writeFile = (key: string, data: Buffer) => be().write(key, data);
export const removeFile = (key: string) => be().remove(key);
export const fileVersion = (key: string) => be().version(key);
export const fileExists = async (key: string) => (await be().version(key)) !== "0";
export const listFiles = (prefix: string) => be().list(prefix);
export async function copyFile(from: string, to: string) {
  const b = await readFile(from);
  if (b) await writeFile(to, b);
}
