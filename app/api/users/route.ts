import { requirePermission, requireAdministrator } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/write-request";
import { getMysql } from "@/lib/mysql";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("junyang_session")?.value;
  if (!token) return NextResponse.json({ error: "请先登录旧系统账号" }, { status: 401 });
  try {
    if (request.nextUrl.searchParams.has("staff")) {
      const denied = await requireAdministrator(request); if (denied) return denied;
      const search = (request.nextUrl.searchParams.get("staff") || "").trim().slice(0, 30).replace(/[\\%_]/g, "\\$&");
      const [staff] = await getMysql().execute<RowDataPacket[]>("SELECT id, name FROM staff_staff WHERE user_id IS NULL AND name LIKE ? ORDER BY name LIMIT 50", [`%${search}%`]);
      return NextResponse.json({ staff: staff.map((row) => ({ id: row.id, name: row.name })) }, { headers: { "Cache-Control": "no-store" } });
    }
    const denied = await requirePermission(request, ["user_view"]); if (denied) return denied;
    const admin = await requireAdministrator(request);
    if (admin && admin.status !== 403) return admin;
    const [rows] = await getMysql().execute<RowDataPacket[]>("SELECT u.id, u.username, u.password, u.is_active, DATE_FORMAT(u.date_joined, '%Y-%m-%d') AS date, DATE_FORMAT(u.last_login, '%Y-%m-%dT%H:%i:%sZ') AS lastLogin, s.name FROM auth_user u LEFT JOIN staff_staff s ON s.user_id = u.id WHERE u.is_superuser = 0 ORDER BY u.id");
    const [groups] = await getMysql().execute<RowDataPacket[]>("SELECT ug.user_id, g.name FROM auth_user_groups ug JOIN auth_group g ON g.id = ug.group_id ORDER BY ug.id");
    return NextResponse.json({ users: rows.map((row) => ({ id: row.id, username: row.username, name: row.name || "", active: Boolean(row.is_active), groups: groups.filter((group) => group.user_id === row.id).map((group) => group.name), date: row.date, lastLogin: row.lastLogin, ...(!admin ? { password: typeof row.password === "string" ? row.password : "" } : {}) })) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "无法读取用户数据，请检查登录服务和 SSH 隧道" }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const token = request.cookies.get("junyang_session")?.value;
  if (!token) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
  if (typeof body.username !== "string" || !/^[\w.@+-]{1,30}$/.test(body.username) || typeof body.password !== "string" || body.password.length < 8 || body.password.length > 30 || !Number.isSafeInteger(body.staffId) || body.staffId < 1 || typeof body.active !== "boolean" || (body.groupId !== null && (!Number.isSafeInteger(body.groupId) || body.groupId < 1))) return NextResponse.json({ error: "账号信息无效，密码需要 8–30 位" }, { status: 400 });
  try {
    const denied = await requireAdministrator(request); if (denied) return denied;
    const connection = await getMysql().getConnection();
    try {
      await connection.beginTransaction();
      const [staff] = await connection.execute<RowDataPacket[]>("SELECT id, user_id FROM staff_staff WHERE id = ? FOR UPDATE", [body.staffId]);
      if (!staff.length || staff[0].user_id !== null) { await connection.rollback(); return NextResponse.json({ error: "人员不存在或已绑定账号" }, { status: 409 }); }
      if (body.groupId !== null) {
        const [groups] = await connection.execute<RowDataPacket[]>("SELECT id FROM auth_group WHERE id = ? FOR UPDATE", [body.groupId]);
        if (!groups.length) { await connection.rollback(); return NextResponse.json({ error: "角色不存在" }, { status: 400 }); }
        const [deleted] = await connection.execute<RowDataPacket[]>("SELECT group_id FROM junyang_deleted_roles WHERE group_id = ?", [body.groupId]);
        if (deleted.length) { await connection.rollback(); return NextResponse.json({ error: "角色已删除" }, { status: 409 }); }
      }
      // shortcut: legacy ordinary-user login compares plaintext; migrate both login services before changing storage format.
      const [created] = await connection.execute<ResultSetHeader>("INSERT INTO auth_user (username, password, is_superuser, is_staff, is_active, first_name, last_name, email, date_joined) VALUES (?, ?, 0, 0, ?, '', '', '', UTC_TIMESTAMP(6))", [body.username, body.password, body.active]);
      await connection.execute("UPDATE staff_staff SET user_id = ? WHERE id = ?", [created.insertId, body.staffId]);
      await connection.execute("INSERT INTO account_panel (user_id, no_file, no_deposit, no_deposit_return, no_entry_pay, no_offer, no_person, bid_date, no_material, no_company_payproof, no_persenal_payproof, cert_date, exam_date) VALUES (?, '不显示', '不显示', '不显示', '不显示', '不显示', '不显示', '不显示', '不显示', '不显示', '不显示', '不显示', '不显示')", [created.insertId]);
      if (body.groupId !== null) await connection.execute("INSERT INTO auth_user_groups (user_id, group_id) VALUES (?, ?)", [created.insertId, body.groupId]);
      await connection.commit();
      return NextResponse.json({ ok: true });
    } catch (error) {
      await connection.rollback();
      if ((error as { code?: string }).code === "ER_DUP_ENTRY") return NextResponse.json({ error: "账号名已存在" }, { status: 409 });
      throw error;
    } finally { connection.release(); }
  } catch { return NextResponse.json({ error: "创建账号失败，请检查权限服务和数据库连接" }, { status: 503 }); }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const token = request.cookies.get("junyang_session")?.value;
  if (!token) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
  if (!Number.isSafeInteger(body.id) || body.id < 1 || typeof body.username !== "string" || !/^[\w.@+-]{1,30}$/.test(body.username) || (body.password !== undefined && (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 30)) || typeof body.active !== "boolean" || typeof body.expectedUsername !== "string" || typeof body.expectedActive !== "boolean" || (body.groupId !== undefined && body.groupId !== null && (!Number.isSafeInteger(body.groupId) || body.groupId < 1)) || !Array.isArray(body.expectedGroups) || !body.expectedGroups.every((name: unknown) => typeof name === "string" && name.length <= 150)) return NextResponse.json({ error: "账号信息无效，密码需要 8–30 位" }, { status: 400 });
  try {
    const denied = await requireAdministrator(request); if (denied) return denied;
    const connection = await getMysql().getConnection();
    try {
      await connection.beginTransaction();
      const [users] = await connection.execute<RowDataPacket[]>("SELECT id, username, is_active FROM auth_user WHERE id = ? AND is_superuser = 0 FOR UPDATE", [body.id]);
      if (!users.length) { await connection.rollback(); return NextResponse.json({ error: "账号不存在" }, { status: 404 }); }
      if (users[0].username !== body.expectedUsername || Boolean(users[0].is_active) !== body.expectedActive) { await connection.rollback(); return NextResponse.json({ error: "账号信息已变化，请刷新后重试" }, { status: 409 }); }
      const [groups] = await connection.execute<RowDataPacket[]>("SELECT g.name FROM auth_user_groups ug JOIN auth_group g ON g.id = ug.group_id WHERE ug.user_id = ? FOR UPDATE", [body.id]);
      const current = groups.map((group) => String(group.name)).sort();
      if (JSON.stringify(current) !== JSON.stringify([...body.expectedGroups].sort())) { await connection.rollback(); return NextResponse.json({ error: "账号角色已变化，请刷新后重试" }, { status: 409 }); }
      if (body.groupId !== undefined && body.groupId !== null) {
        const [target] = await connection.execute<RowDataPacket[]>("SELECT id FROM auth_group WHERE id = ? FOR UPDATE", [body.groupId]);
        if (!target.length) { await connection.rollback(); return NextResponse.json({ error: "角色不存在" }, { status: 400 }); }
        const [deleted] = await connection.execute<RowDataPacket[]>("SELECT group_id FROM junyang_deleted_roles WHERE group_id = ?", [body.groupId]);
        if (deleted.length) { await connection.rollback(); return NextResponse.json({ error: "角色已删除" }, { status: 409 }); }
      }
      await connection.execute("UPDATE auth_user SET username = ?, is_active = ? WHERE id = ?", [body.username, body.active, body.id]);
      if (body.password !== undefined) await connection.execute("UPDATE auth_user SET password = ? WHERE id = ?", [body.password, body.id]);
      if (body.groupId !== undefined) {
        await connection.execute("DELETE FROM auth_user_groups WHERE user_id = ?", [body.id]);
        if (body.groupId !== null) await connection.execute("INSERT INTO auth_user_groups (user_id, group_id) VALUES (?, ?)", [body.id, body.groupId]);
      }
      await connection.commit();
      return NextResponse.json({ ok: true });
    } catch (error) {
      await connection.rollback();
      if ((error as { code?: string }).code === "ER_DUP_ENTRY") return NextResponse.json({ error: "账号名已存在" }, { status: 409 });
      throw error;
    } finally { connection.release(); }
  } catch { return NextResponse.json({ error: "保存结果未知，请刷新列表确认后再试" }, { status: 503 }); }
}
