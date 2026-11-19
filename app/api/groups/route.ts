import { requireSession, requirePermission, roleManager } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import { getMysql } from "@/lib/mysql";
import { permissionCatalog } from "@/lib/permission-catalog";
import { sameOrigin } from "@/lib/write-request";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireSession(request);
  if (denied) return denied;
  try {
    if (request.nextUrl.searchParams.get("catalog") === "1") {
      if (!(await roleManager(request))) return NextResponse.json({ error: "只有管理角色可以管理角色" }, { status: 403 });
      return NextResponse.json({ permissions: await permissionCatalog() }, { headers: { "Cache-Control": "no-store" } });
    }
    const permissionDenied = await requirePermission(request, ["group_view"]);
    if (permissionDenied) return permissionDenied;
    const db = getMysql();
    const [[groups], [permissions], [members], catalog] = await Promise.all([
      db.execute<RowDataPacket[]>("SELECT id, name FROM auth_group g WHERE NOT EXISTS (SELECT 1 FROM junyang_deleted_roles d WHERE d.group_id = g.id) ORDER BY id"),
      db.execute<RowDataPacket[]>("SELECT group_id, permission_id FROM auth_group_permissions"),
      db.execute<RowDataPacket[]>("SELECT ug.group_id, s.name FROM auth_user_groups ug LEFT JOIN staff_staff s ON s.user_id = ug.user_id ORDER BY ug.id"),
      permissionCatalog(),
    ]);
    const mark = (nodes: typeof catalog, selected: Set<number>): typeof catalog => nodes.map((node) => ({ ...node, flag: selected.has(node.id), children: mark(node.children, selected) }));
    return NextResponse.json({ groups: groups.map((group) => {
      const ids = permissions.filter((row) => row.group_id === group.id).map((row) => Number(row.permission_id));
      const users = members.filter((row) => row.group_id === group.id);
      return { id: group.id, name: group.name, usersCount: users.length, members: users.map((user) => user.name).filter(Boolean), permissions: mark(catalog, new Set(ids)), permissionIds: ids };
    }) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "无法读取角色列表，请检查登录服务" }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const token = request.cookies.get("junyang_session")?.value;
  if (!token) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
  const editing = body.id !== undefined;
  if ((editing && (!Number.isSafeInteger(body.id) || body.id < 1 || typeof body.expectedName !== "string" || body.expectedName.length > 150)) || typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 150 || !Array.isArray(body.permissions) || body.permissions.length > 200 || !body.permissions.every((id: unknown) => Number.isSafeInteger(id) && Number(id) > 0) || (editing && (!Array.isArray(body.expectedPermissions) || !body.expectedPermissions.every((id: unknown) => Number.isSafeInteger(id) && Number(id) > 0)))) return NextResponse.json({ error: "角色信息无效" }, { status: 400 });
  try {
    if (!(await roleManager(request))) return NextResponse.json({ error: "只有管理角色可以管理角色" }, { status: 403 });
    const catalog = { view_permission: await permissionCatalog() };
    const allowed = new Set<number>();
    const visit = (nodes: { id: number; children?: unknown[] }[]) => { for (const node of nodes) { if (Number.isSafeInteger(node.id)) allowed.add(node.id); if (Array.isArray(node.children)) visit(node.children as typeof nodes); } };
    if (!Array.isArray(catalog.view_permission)) throw new Error("Invalid permissions");
    visit(catalog.view_permission);
    const selected = [...new Set<number>(body.permissions)];
    if (selected.some((id) => !allowed.has(id))) return NextResponse.json({ error: "权限编号无效" }, { status: 400 });
    const connection = await getMysql().getConnection();
    try {
      await connection.beginTransaction();
      let id = body.id as number;
      let hidden: number[] = [];
      if (editing) {
        const [groups] = await connection.execute<RowDataPacket[]>("SELECT id, name FROM auth_group WHERE id = ? FOR UPDATE", [id]);
        if (!groups.length) { await connection.rollback(); return NextResponse.json({ error: "角色不存在" }, { status: 404 }); }
        if (groups[0].name !== body.expectedName) { await connection.rollback(); return NextResponse.json({ error: "角色名称已变化，请刷新后重试" }, { status: 409 }); }
        const [deleted] = await connection.execute<RowDataPacket[]>("SELECT group_id FROM junyang_deleted_roles WHERE group_id = ?", [id]);
        if (deleted.length) { await connection.rollback(); return NextResponse.json({ error: "角色已删除" }, { status: 409 }); }
        const [current] = await connection.execute<RowDataPacket[]>("SELECT permission_id FROM auth_group_permissions WHERE group_id = ? FOR UPDATE", [id]);
        const ids = current.map((row) => Number(row.permission_id)).sort((a, b) => a - b);
        const expected = [...new Set<number>(body.expectedPermissions)].sort((a, b) => a - b);
        if (JSON.stringify(ids) !== JSON.stringify(expected)) { await connection.rollback(); return NextResponse.json({ error: "角色权限已变化，请刷新后重试" }, { status: 409 }); }
        hidden = ids.filter((value) => !allowed.has(value));
        await connection.execute("UPDATE auth_group SET name = ? WHERE id = ?", [body.name.trim(), id]);
        await connection.execute("DELETE FROM auth_group_permissions WHERE group_id = ?", [id]);
      } else {
        const [created] = await connection.execute<ResultSetHeader>("INSERT INTO auth_group (name) VALUES (?)", [body.name.trim()]);
        id = created.insertId;
      }
      for (const permission of [...selected, ...hidden]) await connection.execute("INSERT INTO auth_group_permissions (group_id, permission_id) VALUES (?, ?)", [id, permission]);
      await connection.commit();
      return NextResponse.json({ ok: true });
    } catch (error) {
      await connection.rollback();
      if ((error as { code?: string }).code === "ER_DUP_ENTRY") return NextResponse.json({ error: "角色名称已存在" }, { status: 409 });
      throw error;
    } finally { connection.release(); }
  } catch { return NextResponse.json({ error: "角色保存失败，请检查权限服务和数据库连接" }, { status: 503 }); }
}
