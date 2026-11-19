import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { sameOrigin } from "@/lib/write-request";
import { getMysql } from "@/lib/mysql";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { randomUUID } from "node:crypto";
import { pinyin } from "pinyin-pro";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requirePermission(request, ["staff_staff"]);
  if (denied) return denied;
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!/^[1-9]\d{0,9}$/.test(id)) return NextResponse.json({ error: "人员编号无效" }, { status: 400 });
  try {
    const salaryDenied = await requirePermission(request, ["salarydetail_view", "salarydetail_change"]);
    if (salaryDenied && salaryDenied.status !== 403) return salaryDenied;
    const [rows] = await getMysql().execute<RowDataPacket[]>(`SELECT name, phone, position, DATE_FORMAT(entrydate, '%Y-%m-%d') AS entrydate, staff_status${salaryDenied ? "" : ", salary, percentage"} FROM staff_staff WHERE id = ?`, [id]);
    const row = rows[0];
    if (!row) return NextResponse.json({ error: "人员不存在" }, { status: 404 });
    return NextResponse.json({ name: row.name, phone: row.phone, position: row.position, entrydate: row.entrydate, staff_status: row.staff_status, ...(!salaryDenied ? { salary: row.salary, percentage: row.percentage } : {}) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "人员服务不可用" }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
  const isEdit = body.id !== undefined;
  if (isEdit && (!Number.isSafeInteger(body.id) || body.id < 1)) return NextResponse.json({ error: "人员编号无效" }, { status: 400 });
  const denied = await requirePermission(request, [isEdit ? "staff_staff" : "staff_add"]);
  if (denied) return denied;
  const { name } = body;
  const phone = body.phone ?? "";
  const position = body.position ?? "";
  const entrydate = body.entrydate || null;
  const staff_status = body.staff_status || null;
  const date = typeof entrydate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entrydate) ? new Date(`${entrydate}T00:00:00Z`) : null;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 15 || typeof phone !== "string" || (!isEdit && !phone.trim()) || phone.length > 20 || typeof position !== "string" || position.length > 15 || (!isEdit && !entrydate) || (entrydate !== null && (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== entrydate)) || (!isEdit && !staff_status) || (staff_status !== null && !["ON", "OFF", "ON-TRY", "ON-HALF"].includes(staff_status))) return NextResponse.json({ error: "请正确填写人员信息" }, { status: 400 });
  const hasSalary = body.salary !== undefined || body.percentage !== undefined;
  if ((!isEdit || hasSalary) && !((isEdit && body.salary === null) || (typeof body.salary === "number" && Number.isFinite(body.salary) && body.salary >= 0 && body.salary <= 10000000))) return NextResponse.json({ error: "请正确填写工资" }, { status: 400 });
  if ((!isEdit || hasSalary) && !((isEdit && body.percentage === null) || (Number.isInteger(body.percentage) && body.percentage >= 0 && body.percentage <= 100))) return NextResponse.json({ error: "请正确填写提成比例" }, { status: 400 });
  if (isEdit && hasSalary) { const salaryDenied = await requirePermission(request, ["salarydetail_view", "salarydetail_change"]); if (salaryDenied) return salaryDenied; }
  const data = { name: name.trim(), phone: phone.trim(), position: position.trim(), entrydate, staff_status, ...(!isEdit ? { salary: body.salary, percentage: body.percentage } : {}) };
  try {
    const connection = await getMysql().getConnection();
    try {
      await connection.beginTransaction();
      const namePinyin = pinyin(data.name, { pattern: "first", toneType: "none", type: "array" }).join("");
      if (isEdit) {
        const [existing] = await connection.execute<RowDataPacket[]>("SELECT id, name FROM staff_staff WHERE id = ? FOR UPDATE", [body.id]);
        if (!existing.length) { await connection.rollback(); return NextResponse.json({ error: "人员不存在" }, { status: 404 }); }
        await connection.execute("UPDATE staff_staff SET name = ?, name_pinyin = ?, phone = ?, position = ?, entrydate = ?, staff_status = ? WHERE id = ?", [data.name, namePinyin, data.phone, data.position, data.entrydate, data.staff_status, body.id]);
        if (hasSalary) await connection.execute("UPDATE staff_staff SET salary = ?, percentage = ? WHERE id = ?", [body.salary, body.percentage, body.id]);
        if (existing[0].name !== data.name) {
          await connection.execute("UPDATE staff_certificate SET cert_person_name = ? WHERE staff_id = ?", [data.name, body.id]);
          await connection.execute("UPDATE staff_exam SET exam_person_name = ? WHERE staff_id = ?", [data.name, body.id]);
        }
      } else {
        const [existing] = await connection.execute<RowDataPacket[]>("SELECT id FROM staff_staff WHERE name = ? LIMIT 1 FOR UPDATE", [data.name]);
        if (existing.length) { await connection.rollback(); return NextResponse.json({ error: "员工名重复" }, { status: 409 }); }
        const [created] = await connection.execute<ResultSetHeader>("INSERT INTO staff_staff (u_id, name, name_pinyin, phone, position, entrydate, staff_status, salary, percentage, company_pay) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)", [randomUUID().replace(/-/g, ""), data.name, namePinyin, data.phone, data.position, data.entrydate, data.staff_status, body.salary, body.percentage]);
        await connection.execute("UPDATE staff_exam SET staff_id = ? WHERE exam_person_name = ?", [created.insertId, data.name]);
        await connection.execute("INSERT INTO staff_itemlist (staff_id, itemmessage) VALUES (?, '')", [created.insertId]);
      }
      await connection.commit();
      return NextResponse.json({ ok: true });
    } catch { await connection.rollback(); throw new Error("Save failed"); } finally { connection.release(); }
  } catch { return NextResponse.json({ error: "保存结果未知，请刷新列表确认后再试" }, { status: 503 }); }
}
