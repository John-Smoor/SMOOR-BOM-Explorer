import { NextResponse } from "next/server";
import { editor } from "@/lib/server/auth";

export const ok = (data: unknown = { ok: true }) => NextResponse.json(data);
export const fail = (message: string | string[], status = 400) =>
  NextResponse.json({ errors: Array.isArray(message) ? message : [message] }, { status });

/** Runs fn with the editor's name, or 401s. */
export async function asEditor(fn: (user: string) => Promise<Response>) {
  const user = await editor();
  if (!user) return fail("Your editor session has ended. Unlock editing again from the sidebar.", 401);
  try {
    return await fn(user);
  } catch (e) {
    return fail((e as Error).message || "Something went wrong.", 500);
  }
}
