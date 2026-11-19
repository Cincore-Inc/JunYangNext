import { NextRequest, NextResponse } from "next/server";
import { requireAdministrator, requireSession } from "@/lib/session";
import { getMysql } from "@/lib/mysql";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { randomUUID } from "node:crypto";
import { pinyin } from "pinyin-pro";
import { sameOrigin } from "@/lib/write-request";

export async function GET(request: NextRequest) {
  const denied = await requireSession(request); if (denied) return denied;
  if (request.nextUrl.searchParams.get("options") === "tags") {
    try {
      const [rows] = await getMysql().execute<RowDataPacket[]>("SELECT DISTINCT name FROM company_tags WHERE type = 1 AND name IS NOT NULL AND name <> '' ORDER BY name");
      return NextResponse.json({ tags: rows.map((row) => row.name) }, { headers: { "Cache-Control": "no-store" } });
    } catch { return NextResponse.json({ error: "公司标签暂不可用" }, { status: 503 }); }
  }
  const page = Math.max(1, Math.min(10000, Number.parseInt(request.nextUrl.searchParams.get("page") || "1", 10) || 1));
  const size = Number(request.nextUrl.searchParams.get("pageSize") || 25);
  if (![1, 25, 50, 100, 200, 300, 400].includes(size)) return NextResponse.json({ error: "每页条数无效" }, { status: 400 });
  const q = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 100).replace(/[\\%_]/g, "\\$&");
  const where = "NOT EXISTS (SELECT 1 FROM junyang_deleted_companies d WHERE d.company_id = c.id)" + (q ? " AND (c.name LIKE ? OR c.short_name LIKE ? OR c.legal_person LIKE ? OR c.credit_code LIKE ?)" : "");
  const values = q ? Array(4).fill(`%${q}%`) : [];
  try {
    const db = getMysql();
    const [counts] = await db.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM company_companys c WHERE ${where}`, values);
    const [rows] = await db.execute<RowDataPacket[]>(`SELECT id, name, short_name, credit_code, address, legal_person, legal_person_code, phone, license_info, remark, DATE_FORMAT(report_deadline, '%Y-%m-%d') AS report_deadline, report_status, \`rank\` FROM company_companys c WHERE ${where} ORDER BY \`rank\` DESC, id DESC LIMIT ? OFFSET ?`, [...values, size, (page - 1) * size]);
    const ids = rows.map((row) => row.id);
    const [tags] = ids.length ? await db.execute<RowDataPacket[]>(`SELECT ct.companys_id, t.name FROM company_companys_tags ct JOIN company_tags t ON t.id = ct.tags_id WHERE ct.companys_id IN (${ids.map(() => "?").join(",")})`, ids) : [[]];
    return NextResponse.json({ total: counts[0].total, items: rows.map((row) => ({ ...row, tags_txt_list: tags.filter((tag) => tag.companys_id === row.id).map((tag) => tag.name) })) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "公司资料暂不可用" }, { status: 503 }); }
}

async function write(request: NextRequest, method: "POST" | "PATCH" | "DELETE") {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const denied = await requireAdministrator(request); if (denied) return denied;
  let body: Record<string, unknown>; try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
  const id = Number(body.id);
  if (method !== "POST" && (!Number.isSafeInteger(id) || id <= 0)) return NextResponse.json({ error: "公司编号无效" }, { status: 400 });
  if (method !== "DELETE" && (typeof body.name !== "string" || !body.name.trim() || body.name.length > 99)) return NextResponse.json({ error: "请输入公司名称" }, { status: 400 });
  if (method === "DELETE") {
    try {
      let actor: number | null = null;
      try { const payload = JSON.parse(Buffer.from(request.cookies.get("junyang_session")!.value.split(".")[1], "base64url").toString("utf8")); if (Number.isSafeInteger(payload.user_id) && payload.user_id > 0) actor = payload.user_id; } catch { /* Older sessions may not carry a user ID. */ }
      const connection = await getMysql().getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute<RowDataPacket[]>("SELECT id FROM company_companys WHERE id = ? FOR UPDATE", [id]);
        if (!rows.length) { await connection.rollback(); return NextResponse.json({ error: "公司不存在" }, { status: 404 }); }
        const [deleted] = await connection.execute<RowDataPacket[]>("SELECT company_id FROM junyang_deleted_companies WHERE company_id = ?", [id]);
        if (deleted.length) { await connection.rollback(); return NextResponse.json({ error: "公司已删除" }, { status: 409 }); }
        await connection.execute("INSERT INTO junyang_deleted_companies (company_id, deleted_at, deleted_by) VALUES (?, UTC_TIMESTAMP(6), ?)", [id, actor]);
        await connection.commit(); return NextResponse.json({ ok: true });
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    } catch { return NextResponse.json({ error: "删除结果未知，请刷新后确认" }, { status: 503 }); }
  }
  const strings = ["short_name", "credit_code", "address", "legal_person", "legal_person_code", "phone", "license_info", "remark"] as const;
  if (strings.some((key) => body[key] != null && (typeof body[key] !== "string" || (body[key] as string).length > (["remark", "license_info"].includes(key) ? 2000 : 99))) || (body.tags !== undefined && (!Array.isArray(body.tags) || body.tags.length > 50 || !body.tags.every((tag) => typeof tag === "string" && tag.trim() && tag.length <= 99))) || (body.rank != null && (!Number.isSafeInteger(body.rank) || Number(body.rank) < -2147483648 || Number(body.rank) > 2147483647))) return NextResponse.json({ error: "公司资料无效" }, { status: 400 });
  const deadline = body.report_deadline;
  if (deadline && (typeof deadline !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(deadline) || Number.isNaN(new Date(`${deadline}T00:00:00Z`).getTime()) || new Date(`${deadline}T00:00:00Z`).toISOString().slice(0, 10) !== deadline)) return NextResponse.json({ error: "年报日期无效" }, { status: 400 });
  const name = (body.name as string).trim();
  const values = [name, pinyin(name, { pattern: "first" }).replace(/\s/g, ""), ...strings.map((field) => typeof body[field] === "string" && body[field] ? body[field] as string : null), typeof deadline === "string" && deadline ? deadline : null, typeof body.rank === "number" ? body.rank : 0];
  try {
    const connection = await getMysql().getConnection();
    try {
      await connection.beginTransaction();
      let companyId = id;
      if (method === "POST") {
        const [created] = await connection.execute<ResultSetHeader>("INSERT INTO company_companys (name, name_pinyin, short_name, credit_code, address, legal_person, legal_person_code, phone, license_info, remark, report_deadline, `rank`, report_status, create_at, u_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, UTC_TIMESTAMP(6), ?)", [...values, randomUUID().replace(/-/g, "")]);
        companyId = created.insertId;
      } else {
        const [existing] = await connection.execute<RowDataPacket[]>("SELECT id FROM company_companys WHERE id = ? FOR UPDATE", [companyId]);
        if (!existing.length) { await connection.rollback(); return NextResponse.json({ error: "公司不存在" }, { status: 404 }); }
        const [deleted] = await connection.execute<RowDataPacket[]>("SELECT company_id FROM junyang_deleted_companies WHERE company_id = ?", [companyId]);
        if (deleted.length) { await connection.rollback(); return NextResponse.json({ error: "公司已删除" }, { status: 409 }); }
        await connection.execute("UPDATE company_companys SET name=?, name_pinyin=?, short_name=?, credit_code=?, address=?, legal_person=?, legal_person_code=?, phone=?, license_info=?, remark=?, report_deadline=?, `rank`=? WHERE id=?", [...values, companyId]);
      }
      if (Array.isArray(body.tags)) {
        const tags = [...new Set((body.tags as string[]).map((tag) => tag.trim()))];
        await connection.execute("DELETE FROM company_companys_tags WHERE companys_id = ?", [companyId]);
        for (const tag of tags) {
          const [found] = await connection.execute<RowDataPacket[]>("SELECT id FROM company_tags WHERE name = ? AND type = 1 ORDER BY id LIMIT 1", [tag]);
          const tagId = found.length ? found[0].id : (await connection.execute<ResultSetHeader>("INSERT INTO company_tags (name, type) VALUES (?, 1)", [tag]))[0].insertId;
          await connection.execute("INSERT INTO company_companys_tags (companys_id, tags_id) VALUES (?, ?)", [companyId, tagId]);
        }
      }
      await connection.commit(); return NextResponse.json({ ok: true });
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  } catch { return NextResponse.json({ error: "操作结果未知，请刷新后确认" }, { status: 503 }); }
}
export const POST = (request: NextRequest) => write(request, "POST");
export const PATCH = (request: NextRequest) => write(request, "PATCH");
export const DELETE = (request: NextRequest) => write(request, "DELETE");
