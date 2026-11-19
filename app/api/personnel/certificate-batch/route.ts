import type { RowDataPacket } from "mysql2";
import { NextRequest, NextResponse } from "next/server";
import { getMysql } from "@/lib/mysql";
import { requireAdministrator, requirePermission } from "@/lib/session";
import { sameOrigin } from "@/lib/write-request";
import { deletionActor } from "@/lib/personnel-soft-delete";
import { isCertificateStatus } from "@/lib/certificate-status";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
  if (!["update", "delete"].includes(body.action) || !Array.isArray(body.records) || !body.records.length || body.records.length > 100 || !body.records.every((row: { id?: unknown; status?: unknown; nextDate?: unknown }) => Number.isSafeInteger(row.id) && Number(row.id) > 0 && (row.status === null || row.status === "" || isCertificateStatus(row.status)) && (row.nextDate === null || (typeof row.nextDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.nextDate))))) return NextResponse.json({ error: "所选记录无效" }, { status: 400 });
  const ids = body.records.map((row: { id: number }) => row.id);
  if (new Set(ids).size !== ids.length) return NextResponse.json({ error: "证件重复" }, { status: 400 });
  if (body.action === "update") {
    if (!(body.status === '' || isCertificateStatus(body.status)) || typeof body.nextDate !== 'string' || (!body.status && !body.nextDate)) return NextResponse.json({ error: "请选择年审状态或日期" }, { status: 400 });
    if (body.nextDate) { const d = new Date(`${body.nextDate}T00:00:00Z`); if (!/^\d{4}-\d{2}-\d{2}$/.test(body.nextDate) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== body.nextDate) return NextResponse.json({ error: "日期无效" }, { status: 400 }); }
  }
  const denied = body.action === "delete" ? await requireAdministrator(request) : await requirePermission(request, ["certificate_view", "certificate_cert_status_change"]);
  if (denied) return denied;
  try {
    const connection = await getMysql().getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<RowDataPacket[]>(`SELECT id, cert_status, DATE_FORMAT(cert_next_date, '%Y-%m-%d') AS next_date FROM staff_certificate WHERE id IN (${ids.map(() => "?").join(",")}) FOR UPDATE`, ids);
      const expected = new Map(body.records.map((row: { id: number; status: string | null; nextDate: string | null }) => [row.id, row]));
      if (rows.length !== ids.length || rows.some((row) => { const item = expected.get(row.id) as { status: string | null; nextDate: string | null } | undefined; return !item || item.status !== row.cert_status || item.nextDate !== row.next_date; })) { await connection.rollback(); return NextResponse.json({ error: "证件已变化或不存在，请刷新后重试" }, { status: 409 }); }
      const [deleted] = await connection.execute<RowDataPacket[]>(`SELECT record_id FROM junyang_deleted_personnel WHERE kind = 'certificates' AND record_id IN (${ids.map(() => "?").join(",")})`, ids);
      if (deleted.length) { await connection.rollback(); return NextResponse.json({ error: "部分证件已删除，请刷新后重试" }, { status: 409 }); }
      if (body.action === "delete") {
        const actor = deletionActor(request);
        for (const id of ids) await connection.execute("INSERT INTO junyang_deleted_personnel (kind, record_id, deleted_at, deleted_by) VALUES ('certificates', ?, UTC_TIMESTAMP(6), ?)", [id, actor]);
      } else {
        const assignments = [body.status ? "cert_status = ?" : "", body.nextDate ? "cert_next_date = ?" : ""].filter(Boolean);
        await connection.execute(`UPDATE staff_certificate SET ${assignments.join(", ")} WHERE id IN (${ids.map(() => "?").join(",")})`, [...(body.status ? [body.status] : []), ...(body.nextDate ? [body.nextDate] : []), ...ids]);
      }
      await connection.commit(); return NextResponse.json({ ok: true });
    } catch { await connection.rollback(); throw new Error("Batch failed"); } finally { connection.release(); }
  } catch { return NextResponse.json({ error: "批量操作结果未知，请刷新后确认" }, { status: 503 }); }
}
