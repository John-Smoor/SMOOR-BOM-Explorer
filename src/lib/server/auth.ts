import crypto from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "smoor_bom_editor";
const PASSWORD = () => process.env.BOM_EDITOR_PASSWORD || "change-me"; // same default as config.py
const SECRET = () => `${process.env.SESSION_SECRET || ""}::${PASSWORD()}`; // rotating the password logs everyone out

const sign = (v: string) => crypto.createHmac("sha256", SECRET()).update(v).digest("base64url");

export function checkPassword(pwd: string) {
  const a = Buffer.from(pwd);
  const b = Buffer.from(PASSWORD());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function setEditor(name: string) {
  const v = Buffer.from(name, "utf8").toString("base64url");
  (await cookies()).set(COOKIE, `${v}.${sign(v)}`, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12,
  });
}

export async function clearEditor() {
  (await cookies()).delete(COOKIE);
}

/** Editor name if the session is valid, else null. */
export async function editor(): Promise<string | null> {
  const c = (await cookies()).get(COOKIE)?.value;
  if (!c) return null;
  const [v, sig] = c.split(".");
  if (!v || !sig) return null;
  const good = sign(v);
  if (good.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
  const name = Buffer.from(v, "base64url").toString("utf8").trim();
  return name || null;
}
