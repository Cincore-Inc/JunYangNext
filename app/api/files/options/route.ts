import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getMysql } from "@/lib/mysql";
import { getMongo } from "@/lib/db";
import { requirePermission } from "@/lib/session";

export async function GET(request: NextRequest) {
  const denied = await requirePermission(request, ["file_view"]); if (denied) return denied;
  try {
    if (request.nextUrl.searchParams.has("ids")) {
      const ids = (request.nextUrl.searchParams.get("ids") || "").split(",").filter(Boolean);
      if (ids.length > 60 || ids.some(id => !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id))) return NextResponse.json({ error: "关联选项无效" }, { status: 400 });
      if (!ids.length) return NextResponse.json({ items: [] });
      const placeholders = ids.map(() => "?").join(","), values = ids.map(id => id.replaceAll("-", ""));
      const db = getMysql();
      const [[companies], [staff]] = await Promise.all([
        db.execute<RowDataPacket[]>(`SELECT u_id, name FROM company_companys WHERE u_id IN (${placeholders})`, values),
        db.execute<RowDataPacket[]>(`SELECT u_id, name FROM staff_staff WHERE u_id IN (${placeholders})`, values),
      ]);
      return NextResponse.json({ items: [...companies, ...staff].filter(row => row.u_id && row.name).map(row => ({ value: String(row.u_id).replace(/^(........)(....)(....)(....)(............)$/, "$1-$2-$3-$4-$5"), label: row.name })) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (request.nextUrl.searchParams.has("people")) {
      const q = (request.nextUrl.searchParams.get("people") || "").trim().slice(0, 80).replace(/[\\%_]/g, "\\$&");
      const db = getMysql(), term = `%${q}%`;
      const [[companies], [staff]] = await Promise.all([
        db.execute<RowDataPacket[]>("SELECT u_id, name FROM company_companys c WHERE (name LIKE ? OR name_pinyin LIKE ?) AND NOT EXISTS (SELECT 1 FROM junyang_deleted_companies d WHERE d.company_id = c.id) ORDER BY id LIMIT 10", [term, term]),
        db.execute<RowDataPacket[]>("SELECT u_id, name FROM staff_staff WHERE name LIKE ? OR name_pinyin LIKE ? ORDER BY id LIMIT 50", [term, term]),
      ]);
      const items = [...companies, ...staff].filter(row => row.u_id && row.name).map(row => ({ value: String(row.u_id).replace(/^(........)(....)(....)(....)(............)$/, "$1-$2-$3-$4-$5"), label: row.name }));
      return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
    }
    const db = (await getMongo()).db("junyang-files");
    const [categories, tags, historical] = await Promise.all([
      db.collection("categories").find({ enabled: { $ne: false } }, { projection: { name: 1, subCategories: 1 }, maxTimeMS: 10000 }).toArray(),
      db.collection("files").distinct("tags", { enabled: { $ne: false } }, { maxTimeMS: 10000 }),
      db.collection("files").aggregate([{ $match: { enabled: { $ne: false }, type: { $type: "string", $ne: "" } } }, { $group: { _id: { type: "$type", subtype: "$subtype" } } }], { maxTimeMS: 10000 }).toArray(),
    ]);
    const active = categories.filter(row => typeof row.name === "string").map(row => ({ id: String(row._id), name: row.name as string, subCategories: Array.isArray(row.subCategories) ? row.subCategories.filter((v: unknown): v is string => typeof v === "string") : [] }));
    const filterCategories = new Map<string, { name: string; deleted: boolean; subCategories: { name: string; deleted: boolean }[] }>();
    for (const category of active) filterCategories.set(category.name, { name: category.name, deleted: false, subCategories: category.subCategories.map(name => ({ name, deleted: false })) });
    for (const row of historical) {
      const { type, subtype } = row._id || {};
      if (typeof type !== "string" || !type) continue;
      if (!filterCategories.has(type)) filterCategories.set(type, { name: type, deleted: true, subCategories: [] });
      const category = filterCategories.get(type)!;
      if (typeof subtype === "string" && subtype && !category.subCategories.some(item => item.name === subtype)) category.subCategories.push({ name: subtype, deleted: true });
    }
    return NextResponse.json({ categories: active, filterCategories: [...filterCategories.values()], tags: tags.filter(v => typeof v === "string") }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "无法读取文件筛选选项" }, { status: 503 }); }
}
