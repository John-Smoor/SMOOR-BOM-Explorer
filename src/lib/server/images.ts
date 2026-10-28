/** Product images: files in <data>/fg-images (or the "fg-images/" prefix in Netlify Blobs) named by FG code (FGC0984.png) or, as a fallback, by FG name. */
import { listFiles } from "./files";
import type { BomRow } from "../types";

export const IMAGE_PREFIX = "fg-images";
const EXT = /\.(png|jpe?g|webp|avif|gif)$/i;
const norm = (s: string) => s.replace(/\u00a0/g, " ").replace(/[^a-z0-9]/gi, "").toLowerCase();

/** FG code -> image URL. Code match wins over name match. */
export async function imageMap(master: BomRow[]): Promise<Record<string, string>> {
  const files = (await listFiles(IMAGE_PREFIX)).filter((f) => EXT.test(f.key));
  const byKey = new Map<string, string>();
  for (const f of files) {
    const name = f.key.split("/").pop()!;
    byKey.set(norm(name.replace(EXT, "")), `/api/fg-image/${encodeURIComponent(name)}?v=${encodeURIComponent(f.version)}`);
  }
  const out: Record<string, string> = {};
  for (const r of master) {
    if (out[r.fgCode]) continue;
    const hit = byKey.get(norm(r.fgCode)) ?? byKey.get(norm(r.fgName));
    if (hit) out[r.fgCode] = hit;
  }
  return out;
}
