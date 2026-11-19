import { NextRequest, NextResponse } from "next/server";
import { localSession } from "@/lib/local-auth";

export const coreUrl = process.env.LEGACY_CORE_URL || "http://127.0.0.1:28001";

const requestSessions = new WeakMap<NextRequest, ReturnType<typeof localSession>>();
function requestLocalSession(request: NextRequest, token: string) {
  let session = requestSessions.get(request);
  if (!session) { session = localSession(token); requestSessions.set(request, session); }
  return session;
}

export async function requireSession(request: NextRequest) {
  const token = request.cookies.get("junyang_session")?.value;
  if (!token) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (token.startsWith("v1.")) {
    try { return await requestLocalSession(request, token) ? null : NextResponse.json({ error: "登录已过期，请重新登录" }, { status: 401 }); }
    catch { return NextResponse.json({ error: "登录服务不可用" }, { status: 503 }); }
  }
  if (process.env.JUNYANG_AUTH_MODE !== "legacy") return NextResponse.json({ error: "登录已过期，请重新登录" }, { status: 401 });
  try {
    const response = await fetch(`${coreUrl}/api/account/staffname/`, { headers: { Authorization: `JWT ${token}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (response.status === 401 || response.status === 403) return NextResponse.json({ error: "登录已过期，请重新登录" }, { status: 401 });
    if (!response.ok) throw new Error("Session validation failed");
    return null;
  } catch {
    return NextResponse.json({ error: "登录服务不可用，请检查连接后重试" }, { status: 503 });
  }
}

export async function requirePermission(request: NextRequest, permissions: string[], mode: "all" | "any" = "all") {
  const token = request.cookies.get("junyang_session")?.value;
  if (!token) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (token.startsWith("v1.")) {
    try {
      const access = await requestLocalSession(request, token);
      if (!access) return NextResponse.json({ error: "登录已过期，请重新登录" }, { status: 401 });
      const allowed = mode === "all" ? permissions.every((key) => access.permissions[key]) : permissions.some((key) => access.permissions[key]);
      return access.administrator || allowed ? null : NextResponse.json({ error: "当前账号没有访问该功能的权限" }, { status: 403 });
    } catch { return NextResponse.json({ error: "权限服务不可用" }, { status: 503 }); }
  }
  if (process.env.JUNYANG_AUTH_MODE !== "legacy") return NextResponse.json({ error: "登录已过期，请重新登录" }, { status: 401 });
  try {
    const response = await fetch(`${coreUrl}/api/account/mypermission/`, { headers: { Authorization: `JWT ${token}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (response.status === 401 || response.status === 403) return NextResponse.json({ error: "登录已过期，请重新登录" }, { status: 401 });
    if (!response.ok) throw new Error("Permission service failed");
    const granted = await response.json();
    const allowed = mode === "all" ? permissions.every((key) => granted[key] === true) : permissions.some((key) => granted[key] === true);
    return allowed || await roleManager(request) ? null : NextResponse.json({ error: "当前账号没有访问该功能的权限" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "权限服务不可用，请检查连接后重试" }, { status: 503 });
  }
}

export async function requireAdministrator(request: NextRequest) {
  const token = request.cookies.get("junyang_session")?.value;
  if (!token) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (token.startsWith("v1.")) {
    try {
      const access = await requestLocalSession(request, token);
      if (!access) return NextResponse.json({ error: "登录已过期，请重新登录" }, { status: 401 });
      return access.administrator ? null : NextResponse.json({ error: "只有管理员可以执行此操作" }, { status: 403 });
    } catch { return NextResponse.json({ error: "权限服务不可用" }, { status: 503 }); }
  }
  if (process.env.JUNYANG_AUTH_MODE !== "legacy") return NextResponse.json({ error: "登录已过期，请重新登录" }, { status: 401 });
  try {
    const response = await fetch(`${coreUrl}/api/account/permission/`, { headers: { Authorization: `JWT ${token}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (response.ok) return null;
    if (response.status !== 400 && response.status !== 403) return NextResponse.json({ error: "权限服务不可用或登录已过期" }, { status: response.status === 401 ? 401 : 503 });
    const denied = await requireSession(request); if (denied) return denied;
    let payload; try { payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")); } catch { return NextResponse.json({ error: "只有管理员可以执行此操作" }, { status: 403 }); }
    if (!Number.isSafeInteger(payload.user_id) || payload.user_id < 1) return NextResponse.json({ error: "只有管理员可以执行此操作" }, { status: 403 });
    const { getMysql } = await import("@/lib/mysql");
    const [rows] = await getMysql().execute<import("mysql2").RowDataPacket[]>("SELECT 1 FROM auth_user_groups ug JOIN auth_group g ON g.id = ug.group_id JOIN auth_user u ON u.id = ug.user_id WHERE u.id = ? AND u.is_active = 1 AND g.name = ? AND NOT EXISTS (SELECT 1 FROM junyang_deleted_roles d WHERE d.group_id = g.id) LIMIT 1", [payload.user_id, "管理"]);
    return rows.length ? null : NextResponse.json({ error: "只有管理员可以执行此操作" }, { status: 403 });
  } catch { return NextResponse.json({ error: "权限服务不可用" }, { status: 503 }); }
}

export async function roleManager(request: NextRequest): Promise<boolean> {
  return !(await requireAdministrator(request));
}
