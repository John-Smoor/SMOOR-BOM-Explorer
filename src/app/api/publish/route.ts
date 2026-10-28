import path from "node:path";
import { publish } from "@/lib/server/store";
import { asEditor, ok } from "../_util";

export async function POST(req: Request) {
  return asEditor(async (user) => {
    const { note = "" } = await req.json().catch(() => ({}));
    const [n, backup] = await publish(user, String(note));
    return ok({ changes: n, backup: backup ? path.basename(backup) : "" });
  });
}
