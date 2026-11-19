import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { getMysql } from "@/lib/mysql";
import { sameOrigin } from "@/lib/write-request";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { deletePersonnelRecord } from "@/lib/personnel-soft-delete";

function dateTime(value: unknown, required = false) {
  if (!value) return required ? undefined : null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 16) === value ? value.replace("T", " ") : undefined;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
  const editing = body.id !== undefined;
  const examDate = dateTime(body.exam_date), certDate = dateTime(body.cert_date);
  if ((editing && (!Number.isSafeInteger(body.id) || body.id < 1 || !body.expected || typeof body.expected !== "object")) || (body.staff_id !== undefined && (!Number.isSafeInteger(body.staff_id) || body.staff_id < 1)) || typeof body.exam_name !== "string" || body.exam_name.length > 50 || typeof body.exam_person_name !== "string" || body.exam_person_name.length > 15 || examDate === undefined || certDate === undefined || !["", "ON", "OFF"].includes(body.exam_status) || !["", "ON", "OFF"].includes(body.cert_status)) return NextResponse.json({ error: "考试信息无效" }, { status: 400 });
  if (!editing && !body.exam_name.trim() && !body.exam_person_name.trim() && !examDate) return NextResponse.json({ error: "请至少填写考试名称、人员或考试时间中的一项" }, { status: 400 });
  const permissions = ["exam_view"];
  if ((body.exam_status || null) !== (editing ? body.expected.exam_status : null)) permissions.push("exam_exam_status");
  if ((body.cert_status || null) !== (editing ? body.expected.cert_status : null)) permissions.push("exam_cert_status");
  const denied = await requirePermission(request, permissions);
  if (denied) return denied;
  try {
    const connection = await getMysql().getConnection();
    try {
      await connection.beginTransaction();
      const person = body.exam_person_name.trim();
      const unchangedPerson = editing && (body.staff_id === undefined || body.staff_id === body.expected.staff) && person === (body.expected.exam_person_name || "");
      const [staff] = unchangedPerson || (!person && body.staff_id === undefined) ? [[]] : body.staff_id === undefined ? await connection.execute<RowDataPacket[]>("SELECT id FROM staff_staff WHERE name = ? ORDER BY id LIMIT 1", [person]) : await connection.execute<RowDataPacket[]>("SELECT id FROM staff_staff WHERE id = ? AND name = ? LIMIT 1", [body.staff_id, person]);
      if (body.staff_id !== undefined && !unchangedPerson && !staff.length) { await connection.rollback(); return NextResponse.json({ error: "关联人员不存在或姓名已变化，请刷新后重试" }, { status: 409 }); }
      const values = [body.exam_name.trim() || (editing && body.expected.exam_name === "" ? "" : null), person || (editing && body.expected.exam_person_name === "" ? "" : null), examDate, body.exam_status || null, certDate, body.cert_status || null, unchangedPerson ? body.expected.staff : staff[0]?.id || null];
      if (editing) {
        const expected = [body.expected.exam_name, body.expected.exam_person_name, body.expected.exam_date, body.expected.exam_status, body.expected.cert_date, body.expected.cert_status, body.expected.staff];
        if (expected.some((value) => value === undefined || (value !== null && typeof value !== "string" && typeof value !== "number"))) { await connection.rollback(); return NextResponse.json({ error: "记录版本无效" }, { status: 400 }); }
        const versions = [body.expected.exam_date_version, body.expected.cert_date_version];
        if (versions.some((value) => value !== null && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/.test(value)))) { await connection.rollback(); return NextResponse.json({ error: "记录版本无效，请刷新后重试" }, { status: 400 }); }
        const compared = [...expected]; compared[2] = versions[0]; compared[4] = versions[1];
        const changed = ["exam_name", "exam_person_name", "exam_date", "exam_status", "cert_date", "cert_status", "staff_id"].map((field, index) => ({ field, value: values[index], skip: (field === "exam_date" || field === "cert_date") && values[index] === expected[index] }));
        const [result] = await connection.execute<ResultSetHeader>(`UPDATE staff_exam SET ${changed.filter((item) => !item.skip).map((item) => `${item.field}=?`).join(", ")} WHERE id=? AND NOT EXISTS (SELECT 1 FROM junyang_deleted_personnel deleted WHERE deleted.kind = 'exams' AND deleted.record_id = staff_exam.id) AND exam_name <=> ? AND exam_person_name <=> ? AND DATE_FORMAT(exam_date, '%Y-%m-%d %H:%i:%s.%f') <=> ? AND exam_status <=> ? AND DATE_FORMAT(cert_date, '%Y-%m-%d %H:%i:%s.%f') <=> ? AND cert_status <=> ? AND staff_id <=> ?`, [...changed.filter((item) => !item.skip).map((item) => item.value), body.id, ...compared]);
        if (!result.affectedRows) { await connection.rollback(); return NextResponse.json({ error: "考试记录已变化或不存在，请刷新后重试" }, { status: 409 }); }
      } else await connection.execute("INSERT INTO staff_exam (exam_name, exam_person_name, exam_date, exam_status, cert_date, cert_status, staff_id) VALUES (?, ?, ?, ?, ?, ?, ?)", values);
      await connection.commit(); return NextResponse.json({ ok: true });
    } catch { await connection.rollback(); throw new Error("Save failed"); } finally { connection.release(); }
  } catch { return NextResponse.json({ error: "保存结果未知，请刷新后确认" }, { status: 503 }); }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const denied = await requirePermission(request, ["exam_view"]);
  if (denied) return denied;
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!/^[1-9]\d{0,9}$/.test(id)) return NextResponse.json({ error: "编号无效" }, { status: 400 });
  return deletePersonnelRecord(request, "exams", Number(id));
}
