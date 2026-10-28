import { checkPassword, clearEditor, editor, setEditor } from "@/lib/server/auth";
import { fail, ok } from "../_util";

export async function GET() {
  return ok({ user: await editor() });
}
export async function POST(req: Request) {
  const { password = "", name = "" } = await req.json().catch(() => ({}));
  if (!password) return fail("Enter the editor password.");
  if (!checkPassword(String(password))) return fail("Wrong password", 403);
  if (!String(name).trim()) return fail("Enter your name — it's recorded against every change you publish.");
  await setEditor(String(name).trim());
  return ok({ user: String(name).trim() });
}
export async function DELETE() {
  await clearEditor();
  return ok();
}
