import { NextRequest, NextResponse } from "next/server";
import { getMongo } from "@/lib/db";
import { getMysql } from "@/lib/mysql";
import { requirePermission } from "@/lib/session";
import type { RowDataPacket } from "mysql2";
import { ObjectId } from "mongodb";

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
      const client = await getMongo();
      const projects = client.db("junyang-projects").collection("projects");
      const source = request.nextUrl.searchParams.get("source") || "";
      const historical = Boolean(query && request.nextUrl.searchParams.get("historical") === "1");
      if (historical && !["transactions", "receipts", "invoices"].includes(source)) return NextResponse.json({ error: "数据类型无效" }, { status: 400 });
      const [rows, refs] = await Promise.all([
        projects.find(query ? { $or: [{ name: { $regex: escaped, $options: "i" } }, { namePY: { $regex: escaped, $options: "i" } }] } : {}, { projection: { name: 1 }, maxTimeMS: 10000 }).sort({ updatedAt: -1, _id: -1 }).limit(50).toArray(),
        historical ? client.db("junyang-finance").collection(source).aggregate([
          { $match: { "project.value": { $type: "string", $regex: "^[a-fA-F0-9]{24}$" }, $or: [{ "project.label": { $regex: escaped, $options: "i" } }, { "project.name": { $regex: escaped, $options: "i" } }, { "project.value": { $regex: escaped, $options: "i" } }] } },
          { $group: { _id: "$project.value", label: { $first: { $ifNull: ["$project.label", "$project.name"] } } } },
        ], { maxTimeMS: 10000, batchSize: 5000 }).toArray() : Promise.resolve([]),
      ]);
      const items = rows.map((row) => ({ value: String(row._id), label: row.name || "未命名项目" }));
      if (historical) {
        const ids = refs.map((row) => new ObjectId(row._id));
        const found = ids.length ? await projects.find({ _id: { $in: ids } }, { projection: { name: 1 }, maxTimeMS: 10000, batchSize: 5000 }).toArray() : [];
        const known = new Map(found.map((row) => [String(row._id), row.name]));
        const listed = new Set(items.map((row) => row.value.toLowerCase()));
        items.push(...refs.filter((row) => { const id = String(row._id).toLowerCase(); return !listed.has(id) && (!known.has(id) || known.get(id) !== row.label); }).slice(0, 50).map((row) => ({ value: String(row._id), label: `${row.label || `未命名项目 ${row._id}`}（${known.has(String(row._id).toLowerCase()) ? "历史名称" : "历史项目"}）` })));
      }
      return NextResponse.json({ items });
    }
    if (kind === "companies") {
      const escaped = query.replace(/[\\%_]/g, "\\$&");
      const historical = request.nextUrl.searchParams.get("historical") === "1";
      const deleted = "EXISTS (SELECT 1 FROM junyang_deleted_companies d WHERE d.company_id = c.id)";
      const [rows] = await getMysql().execute<RowDataPacket[]>(`SELECT c.u_id, c.name, c.short_name, ${deleted} AS deleted FROM company_companys c WHERE (c.name LIKE ? OR c.short_name LIKE ?)${historical ? "" : ` AND NOT ${deleted}`} ORDER BY c.\`rank\` DESC, c.id DESC LIMIT 50`, [`%${escaped}%`, `%${escaped}%`]);
      return NextResponse.json({ items: rows.map((row) => ({ value: String(row.u_id).replace(/^(........)(....)(....)(....)(............)$/, "$1-$2-$3-$4-$5"), label: `${row.short_name || row.name}${row.deleted ? "（已删除）" : ""}` })) });
    }
    return NextResponse.json({ error: "选项类型无效" }, { status: 400 });
  } catch { return NextResponse.json({ error: "无法读取选项，请检查数据库连接" }, { status: 503 }); }
}
