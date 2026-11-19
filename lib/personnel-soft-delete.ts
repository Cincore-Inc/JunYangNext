import type { RowDataPacket } from "mysql2";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getMysql } from "@/lib/mysql";

export function deletionActor(request: NextRequest) {
  try {
    const token = request.cookies.get("junyang_session")?.value || "";
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return Number.isSafeInteger(payload.user_id) && payload.user_id > 0 ? Number(payload.user_id) : null;
  } catch { return null; }
}

export async function deletePersonnelRecord(request: NextRequest, kind: "certificates" | "exams", id: number) {
  const table = kind === "certificates" ? "staff_certificate" : "staff_exam";
  try {
    const connection = await getMysql().getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<RowDataPacket[]>(`SELECT id FROM ${table} WHERE id = ? FOR UPDATE`, [id]);
      if (!rows.length) { await connection.rollback(); return NextResponse.json({ error: "记录不存在" }, { status: 404 }); }
      const [deleted] = await connection.execute<RowDataPacket[]>("SELECT record_id FROM junyang_deleted_personnel WHERE kind = ? AND record_id = ?", [kind, id]);
      if (deleted.length) { await connection.rollback(); return NextResponse.json({ error: "记录已删除" }, { status: 409 }); }
      await connection.execute("INSERT INTO junyang_deleted_personnel (kind, record_id, deleted_at, deleted_by) VALUES (?, ?, UTC_TIMESTAMP(6), ?)", [kind, id, deletionActor(request)]);
      await connection.commit();
      return NextResponse.json({ ok: true });
    } catch { await connection.rollback(); throw new Error("Delete failed"); } finally { connection.release(); }
  } catch { return NextResponse.json({ error: "删除结果未知，请刷新后确认" }, { status: 503 }); }
}
