import { saveFg } from "@/lib/server/data";
import { asEditor, fail, ok } from "../../_util";

export async function POST(req: Request) {
  return asEditor(async (user) => {
    const b = await req.json();
    const problems = await saveFg(user, String(b.origCode ?? ""), String(b.fgCode ?? ""), String(b.fgName ?? ""), b.lines ?? []);
    return problems.length ? fail(problems, 422) : ok();
  });
}
