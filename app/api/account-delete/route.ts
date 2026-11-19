import { NextRequest, NextResponse } from "next/server";
import { requireAdministrator } from "@/lib/session";
import { sameOrigin } from "@/lib/write-request";
import { getMysql } from "@/lib/mysql";
import { deletionActor } from "@/lib/personnel-soft-delete";
import type { RowDataPacket } from "mysql2";

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const denied = await requireAdministrator(request);
  if (denied) return denied;
  const kind = request.nextUrl.searchParams.get("kind");
  const id = request.nextUrl.searchParams.get("id") || "";
  if (kind !== "group" || !/^[1-9]\d{0,9}$/.test(id)) return NextResponse.json({ error: "参数无效" }, { status: 400 });
  try {
    const connection = await getMysql().getConnection();
    try {
      await connection.beginTransaction();
      const [roles] = await connection.execute<RowDataPacket[]>("SELECT id FROM auth_group WHERE id = ? FOR UPDATE", [id]);
      if (!roles.length) { await connection.rollback(); return NextResponse.json({ error: "角色不存在" }, { status: 404 }); }
      const [deleted] = await connection.execute<RowDataPacket[]>("SELECT group_id FROM junyang_deleted_roles WHERE group_id = ?", [id]);
      if (deleted.length) { await connection.rollback(); return NextResponse.json({ error: "角色已删除" }, { status: 409 }); }
      const [members] = await connection.execute<RowDataPacket[]>("SELECT user_id FROM auth_user_groups WHERE group_id = ? LIMIT 1", [id]);
      if (members.length) { await connection.rollback(); return NextResponse.json({ error: "该角色仍有账号，请先调整账号角色" }, { status: 409 }); }
      await connection.execute("INSERT INTO junyang_deleted_roles (group_id, deleted_at, deleted_by) VALUES (?, UTC_TIMESTAMP(6), ?)", [id, deletionActor(request)]);
      await connection.commit(); return NextResponse.json({ ok: true });
    } catch { await connection.rollback(); throw new Error("Delete failed"); } finally { connection.release(); }
  } catch { return NextResponse.json({ error: "删除结果未知，请刷新后确认" }, { status: 503 }); }
}
