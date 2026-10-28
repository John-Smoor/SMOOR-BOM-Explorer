import { refreshSoh } from "@/lib/server/erp";
import { fail, ok } from "../../_util";

export const maxDuration = 600;
export async function POST() {
  try {
    return ok({ source: await refreshSoh() });
  } catch (e) {
    return fail(`Couldn't pull from ERP: ${(e as Error).message}`, 502);
  }
}
