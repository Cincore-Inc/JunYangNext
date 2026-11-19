import { NextRequest, NextResponse } from "next/server";
import { requireAdministrator, requirePermission } from "@/lib/session";
import { sameOrigin } from "@/lib/write-request";
import { getMysql } from "@/lib/mysql";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { deletePersonnelRecord } from "@/lib/personnel-soft-delete";
import { isCertificateStatus } from "@/lib/certificate-status";

const fields = ["cert_name", "cert_person_name", "cert_start_date", "cert_end_date", "cert_sure", "cert_next_date", "cert_status", "staff_id"] as const;
function validDate(value: unknown) {
  if (value === null || value === "") return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
  const editing = body.id !== undefined;
  if (editing && (!Number.isSafeInteger(body.id) || body.id < 1 || !body.expected || typeof body.expected !== "object")) return NextResponse.json({ error: "证件信息无效" }, { status: 400 });
  const staffId = body.staff_id ?? null, sure = body.cert_sure ?? null;
  if ((!Number.isSafeInteger(staffId) || staffId < 1) && !(editing && staffId === null && body.expected.staff_id === null) || typeof body.cert_name !== "string" || (!editing && !body.cert_name.trim()) || body.cert_name.length > 50 || (!["ON", "OFF", ...(editing ? [null] : [])].includes(sure) && !(editing && sure === "" && body.expected.cert_sure === "")) || !(body.cert_status === "" || isCertificateStatus(body.cert_status)) || ![body.cert_start_date, body.cert_end_date, body.cert_next_date].every(validDate)) return NextResponse.json({ error: "证件信息无效" }, { status: 400 });
  const changingStatus = editing ? (body.cert_status || null) !== (body.expected.cert_status || null) : Boolean(body.cert_status);
  const denied = await requirePermission(request, ["certificate_view", "certificate_add", ...(changingStatus ? ["certificate_cert_status_change"] : [])]);
  if (denied) return denied;
  try {
    const connection = await getMysql().getConnection();
    try {
      await connection.beginTransaction();
      let personName = editing && staffId === body.expected.staff_id ? body.expected.cert_person_name : null;
      if (!editing || staffId !== body.expected.staff_id) {
        const [staff] = await connection.execute<RowDataPacket[]>("SELECT name FROM staff_staff WHERE id = ? FOR UPDATE", [staffId]);
        if (!staff.length || !staff[0].name) { await connection.rollback(); return NextResponse.json({ error: "关联人员不存在" }, { status: 400 }); }
        personName = staff[0].name;
      }
      const values = [body.cert_name.trim() || (editing && body.expected.cert_name === null ? null : ""), personName, body.cert_start_date || null, body.cert_end_date || null, sure, body.cert_next_date || null, body.cert_status || null, staffId];
      if (editing) {
        const expected = fields.map((field) => body.expected[field]);
        if (expected.some((value) => value === undefined || (value !== null && typeof value !== "string" && typeof value !== "number"))) { await connection.rollback(); return NextResponse.json({ error: "记录版本无效" }, { status: 400 }); }
        const [result] = await connection.execute<ResultSetHeader>(`UPDATE staff_certificate SET ${fields.map((field) => `${field} = ?`).join(", ")} WHERE id = ? AND NOT EXISTS (SELECT 1 FROM junyang_deleted_personnel deleted WHERE deleted.kind = 'certificates' AND deleted.record_id = staff_certificate.id) AND ${fields.map((field) => `${field} <=> ?`).join(" AND ")}`, [...values, body.id, ...expected]);
        if (!result.affectedRows) { await connection.rollback(); return NextResponse.json({ error: "证件已变化或不存在，请刷新后重试" }, { status: 409 }); }
      } else {
        await connection.execute(`INSERT INTO staff_certificate (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`, values);
      }
      await connection.commit();
      return NextResponse.json({ ok: true });
    } catch { await connection.rollback(); throw new Error("Save failed"); } finally { connection.release(); }
  } catch { return NextResponse.json({ error: "保存结果未知，请刷新后确认" }, { status: 503 }); }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const denied = await requireAdministrator(request);
  if (denied) return denied;
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!/^[1-9]\d{0,9}$/.test(id)) return NextResponse.json({ error: "证件编号无效" }, { status: 400 });
  return deletePersonnelRecord(request, "certificates", Number(id));
}
