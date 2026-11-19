import { NextRequest, NextResponse } from "next/server";
import { getMongo } from "@/lib/db";
import { getMysql } from "@/lib/mysql";
import { requirePermission } from "@/lib/session";
import type { RowDataPacket } from "mysql2";

const defaultTransactionTypes = ["投标保证金", "中标保证金", "借款", "工程款", "利息", "管理费", "资料费", "承包费", "劳务费", "材料费", "税费", "其他款项"];

export async function GET(request: NextRequest) {
  const denied = await requirePermission(request, ["finance_view"]);
  if (denied) return denied;
  const kind = request.nextUrl.searchParams.get("kind");
  const query = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 80);
  try {
    if (kind === "transactionTypes") {
      const values = await (await getMongo()).db("junyang-finance").collection("transactions").distinct("transactionType", { transactionType: { $type: "string", $ne: "" } }, { maxTimeMS: 10000 });
      const items = [...new Set([...defaultTransactionTypes, ...values.filter((value): value is string => typeof value === "string" && !!value.trim())])].map((value) => ({ value, label: value }));
      return NextResponse.json({ items });
    }
    if (kind === "projects") {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rows = await (await getMongo()).db("junyang-projects").collection("projects").find(query ? { name: { $regex: escaped, $options: "i" } } : {}, { projection: { name: 1 }, maxTimeMS: 10000 }).sort({ updatedAt: -1, _id: -1 }).limit(50).toArray();
      return NextResponse.json({ items: rows.map((row) => ({ value: String(row._id), label: row.name || "未命名项目" })) });
    }
    if (kind === "companies") {
      const escaped = query.replace(/[\\%_]/g, "\\$&");
      const [rows] = await getMysql().execute<RowDataPacket[]>("SELECT u_id, name, short_name FROM company_companys c WHERE (name LIKE ? OR short_name LIKE ?) AND NOT EXISTS (SELECT 1 FROM junyang_deleted_companies d WHERE d.company_id = c.id) ORDER BY `rank` DESC, id DESC LIMIT 50", [`%${escaped}%`, `%${escaped}%`]);
      return NextResponse.json({ items: rows.map((row) => ({ value: String(row.u_id).replace(/^(........)(....)(....)(....)(............)$/, "$1-$2-$3-$4-$5"), label: row.short_name || row.name })) });
    }
    return NextResponse.json({ error: "选项类型无效" }, { status: 400 });
  } catch { return NextResponse.json({ error: "无法读取选项，请检查数据库连接" }, { status: 503 }); }
}
