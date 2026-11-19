import { requestLocalSession, requireSession } from "@/lib/session";
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
  try {
    const access = await requestLocalSession(request, token);
    if (!access) return NextResponse.json({ error: "登录已过期，请重新登录" }, { status: 401 });
    return NextResponse.json({ ok: true, ...access, canManageRoles: access.administrator }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "权限服务不可用" }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  try {
    const { username, password } = await request.json();
    if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password || username.length > 30 || password.length > 128) return NextResponse.json({ error: "请输入账号和密码" }, { status: 400 });
    const [users] = await getMysql().execute<RowDataPacket[]>("SELECT id, password, is_superuser, is_active FROM auth_user WHERE username = ? LIMIT 1", [username.trim()]);
    const user = users[0];
    if (!user || !user.is_active || !await checkPassword(password, user.password, Boolean(user.is_superuser))) return NextResponse.json({ error: "登录失败，请检查账号状态和密码" }, { status: 401 });
    const token = issueLocalSession(Number(user.id), user.password);
    try { await getMysql().execute("UPDATE auth_user SET last_login = UTC_TIMESTAMP(6) WHERE id = ?", [user.id]); } catch { console.error("Failed to record login time"); }
    const reply = NextResponse.json({ ok: true });
    reply.cookies.set("junyang_session", token, { httpOnly: true, sameSite: "strict", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: 3600 });
    return reply;
  } catch {
    return NextResponse.json({ error: "登录服务不可用，请稍后重试" }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const reply = NextResponse.json({ ok: true });
  reply.cookies.delete("junyang_session");
  return reply;
}
