import { deleteFg } from "@/lib/server/data";
import { asEditor, ok } from "../../_util";

export async function POST(req: Request) {
  return asEditor(async (user) => {
    const { code } = await req.json();
    await deleteFg(user, String(code));
    return ok();
  });
}
