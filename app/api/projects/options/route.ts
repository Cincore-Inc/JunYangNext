import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getMysql } from "@/lib/mysql";
import { getMongo } from "@/lib/db";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const denied = await requirePermission(request, ["project_all_view", "project_detail"], "any");
  if (denied) return denied;
  const input = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 80);
  const q = input.replace(/[\\%_]/g, "\\$&");
  const includeHistorical = request.nextUrl.searchParams.get("historical") === "1";
  if (includeHistorical) { const listDenied = await requirePermission(request, ["project_all_view"]); if (listDenied) return listDenied; }
  try {
    const deleted = "EXISTS (SELECT 1 FROM junyang_deleted_companies d WHERE d.company_id = c.id)";
    const [rows] = await getMysql().execute<RowDataPacket[]>(`SELECT c.u_id, c.name, ${deleted} AS deleted FROM company_companys c WHERE (c.name LIKE ? OR c.name_pinyin LIKE ?)${includeHistorical ? "" : ` AND NOT ${deleted}`} ORDER BY c.\`rank\` DESC, c.id DESC LIMIT 30`, [`%${q}%`, `%${q}%`]);
    const items = rows.filter(row => row.u_id && row.name).map(row => ({ value: String(row.u_id).replace(/^(........)(....)(....)(....)(............)$/, "$1-$2-$3-$4-$5"), label: row.name as string, deleted: Boolean(row.deleted) }));
    if (includeHistorical) {
      const pattern = input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const historical = await (await getMongo()).db("junyang-projects").collection("projects").aggregate([{ $match: { winner: { $type: "string", $regex: pattern, $options: "i" } } }, { $group: { _id: "$winner" } }, { $sort: { _id: 1 } }, { $limit: 30 }], { maxTimeMS: 10000 }).toArray();
      items.push(...historical.filter(row => typeof row._id === "string" && row._id.trim() && row._id.length <= 200).map(row => ({ value: `legacy:${row._id}`, label: `${row._id}（历史名称）`, deleted: false })));
    }
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "无法读取公司选项" }, { status: 503 }); }
}
