import { drystockToSoh } from "@/lib/soh/drystock";
import { saveSoh } from "@/lib/server/store";
import { readWorkbook } from "@/lib/server/xlsx";
import { fail, ok } from "../../_util";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail("Choose a DryStock export (.xlsx) first.");
  if (!file.name.toLowerCase().endsWith(".xlsx")) return fail("That file isn't an .xlsx export. Download DryStock Balance from the ERP as Excel and try again.");
  try {
    const [first] = [...(await readWorkbook(await file.arrayBuffer())).values()]; // pd.read_excel: first sheet
    if (!first) return fail("The file has no sheets.");
    await saveSoh(drystockToSoh(first), `upload: ${file.name}`);
    return ok();
  } catch (e) {
    return fail((e as Error).message);
  }
}
