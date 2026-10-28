import { pendingData } from "@/lib/server/data";
import { asEditor, ok } from "../_util";

export const dynamic = "force-dynamic";
export async function GET() {
  return asEditor(async () => ok(await pendingData()));
}
