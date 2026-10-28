import { workbookBuffer, type SheetSpec } from "@/lib/server/xlsx";
import { fail } from "../_util";

export async function POST(req: Request) {
  const { filename = "export.xlsx", sheets = [] } = (await req.json()) as { filename?: string; sheets?: SheetSpec[] };
  if (!sheets.length) return fail("Nothing to export.");
  const buf = await workbookBuffer(sheets.map((s) => ({ name: s.name, columns: s.columns, rows: s.rows })));
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.\-]/g, "_")}"`,
    },
  });
}
