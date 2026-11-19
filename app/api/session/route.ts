import { coreUrl, requestLocalSession, requireSession, roleManager } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import { getMysql } from "@/lib/mysql";
import type { RowDataPacket } from "mysql2";
import { checkPassword, issueLocalSession } from "@/lib/local-auth";

export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest) {
  try {
    const origin = new URL(request.headers.get("origin") || "");
    return ["http:", "https:"].includes(origin.protocol) && origin.host === request.headers.get("host");
  } catch { return false; }
}

export async function GET(request: NextRequest) {
  const denied = await requireSession(request); if (denied) return denied;
  const token = request.cookies.get("junyang_session")!.value;
  if (token.startsWith("v1.")) {
    try {
      const access = await requestLocalSession(request, token);
      if (!access) return NextResponse.json({ error: "登录已过期，请重新登录" }, { status: 401 });
      return NextResponse.json({ ok: true, ...access, canManageRoles: access.administrator }, { headers: { "Cache-Control": "no-store" } });
    } catch { return NextResponse.json({ error: "权限服务不可用" }, { status: 503 }); }
  }
  let permissions: Record<string, boolean>, administrator = false;
  try {
    const headers = { Authorization: `JWT ${token}` };
    const [permissionResponse, adminResponse] = await Promise.all([
      fetch(`${coreUrl}/api/account/mypermission/`, { headers, cache: "no-store", signal: AbortSignal.timeout(8000) }),
      fetch(`${coreUrl}/api/account/permission/`, { headers, cache: "no-store", signal: AbortSignal.timeout(8000) }),
    ]);
    if (!permissionResponse.ok || (![200, 400, 403].includes(adminResponse.status))) return NextResponse.json({ error: "权限服务不可用" }, { status: 503 });
    const raw = await permissionResponse.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid permissions");
    permissions = Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "boolean")) as Record<string, boolean>;
    administrator = adminResponse.ok;
  } catch { return NextResponse.json({ error: "权限服务不可用" }, { status: 503 }); }
  administrator = administrator || await roleManager(request);
  const canManageRoles = administrator;
  let username = "", name = "";
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    if (typeof payload.username === "string") username = payload.username.slice(0, 30);
    if (Number.isSafeInteger(payload.user_id) && payload.user_id > 0) {
      const [rows] = await getMysql().execute<RowDataPacket[]>("SELECT u.username, s.name FROM auth_user u LEFT JOIN staff_staff s ON s.user_id = u.id WHERE u.id = ? LIMIT 1", [payload.user_id]);
      if (typeof rows[0]?.username === "string") username = rows[0].username;
      if (typeof rows[0]?.name === "string") name = rows[0].name;
    }
  } catch { /* Session is still valid if the optional profile lookup is unavailable. */ }
  return NextResponse.json({ ok: true, username, name, permissions, administrator, canManageRoles }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  try {
    const { username, password } = await request.json();
    if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password || username.length > 30 || password.length > 128) return NextResponse.json({ error: "请输入账号和密码" }, { status: 400 });
    if (process.env.JUNYANG_AUTH_MODE !== "legacy") {
      const [users] = await getMysql().execute<RowDataPacket[]>("SELECT id, password, is_superuser, is_active FROM auth_user WHERE username = ? LIMIT 1", [username.trim()]);
      const user = users[0];
      if (!user || !user.is_active || !await checkPassword(password, user.password, Boolean(user.is_superuser))) return NextResponse.json({ error: "登录失败，请检查账号状态和密码" }, { status: 401 });
      const token = issueLocalSession(Number(user.id), user.password);
      try { await getMysql().execute("UPDATE auth_user SET last_login = UTC_TIMESTAMP(6) WHERE id = ?", [user.id]); } catch { console.error("Failed to record login time"); }
      const reply = NextResponse.json({ ok: true });
      reply.cookies.set("junyang_session", token, { httpOnly: true, sameSite: "strict", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: 3600 });
      return reply;
    }
    const response = await fetch(`${coreUrl}/api/account/login/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: username.trim(), password }), signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (response.status >= 500) throw new Error("Login service failed");
    if (!response.ok) return NextResponse.json({ error: "登录失败，请检查账号状态和密码" }, { status: 401 });
    const result = await response.json();
    if (typeof result.token !== "string" || !result.token) throw new Error("Invalid login response");
    try { await getMysql().execute("UPDATE auth_user SET last_login = UTC_TIMESTAMP(6) WHERE username = ?", [username.trim()]); } catch { console.error("Failed to record login time"); }
    const reply = NextResponse.json({ ok: true });
    reply.cookies.set("junyang_session", result.token, { httpOnly: true, sameSite: "strict", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: 3600 });
    return reply;
  } catch {
    return NextResponse.json({ error: "登录服务不可用，请检查 SSH 隧道" }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const reply = NextResponse.json({ ok: true });
  reply.cookies.delete("junyang_session");
  return reply;
}
