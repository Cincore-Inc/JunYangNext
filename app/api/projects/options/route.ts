import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getMysql } from "@/lib/mysql";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const denied = await requirePermission(request, ["project_all_view", "project_detail"], "any");
  if (denied) return denied;
  const q = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 80).replace(/[\\%_]/g, "\\$&");
  try {
    const [rows] = await getMysql().execute<RowDataPacket[]>("SELECT u_id, name FROM company_companys c WHERE (name LIKE ? OR name_pinyin LIKE ?) AND NOT EXISTS (SELECT 1 FROM junyang_deleted_companies d WHERE d.company_id = c.id) ORDER BY `rank` DESC, id DESC LIMIT 30", [`%${q}%`, `%${q}%`]);
    return NextResponse.json({ items: rows.filter(row => row.u_id && row.name).map(row => ({ value: String(row.u_id).replace(/^(........)(....)(....)(....)(............)$/, "$1-$2-$3-$4-$5"), label: row.name })) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "无法读取公司选项" }, { status: 503 }); }
}
