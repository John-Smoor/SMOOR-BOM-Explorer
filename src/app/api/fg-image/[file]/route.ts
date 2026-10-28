import path from "node:path";
import { readFile } from "@/lib/server/files";
import { IMAGE_PREFIX } from "@/lib/server/images";

const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif" };

export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  const name = path.basename(decodeURIComponent((await params).file)); // no path traversal
  const type = TYPES[path.extname(name).toLowerCase()];
  const buf = type ? await readFile(`${IMAGE_PREFIX}/${name}`) : null;
  if (!type || !buf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable" } });
}
