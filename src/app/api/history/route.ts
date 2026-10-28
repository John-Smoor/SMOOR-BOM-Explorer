import { loadHistory } from "@/lib/server/store";
import { ok } from "../_util";

export const dynamic = "force-dynamic";
export async function GET() {
  return ok({ rows: await loadHistory() });
}
