import { discardDraft } from "@/lib/server/store";
import { asEditor, ok } from "../../_util";

export async function POST() {
  return asEditor(async () => { await discardDraft(); return ok(); });
}
