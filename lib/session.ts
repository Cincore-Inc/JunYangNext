import { NextRequest, NextResponse } from "next/server";
import { localSession } from "@/lib/local-auth";

const requestSessions = new WeakMap<NextRequest, ReturnType<typeof localSession>>();
export function requestLocalSession(request: NextRequest, token: string) {
  let session = requestSessions.get(request);
  if (!session) { session = localSession(token); requestSessions.set(request, session); }
  return session;
}

export async function requireSession(request: NextRequest) {
  const token = request.cookies.get("junyang_session")?.value;
  if (!token) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  try { return await requestLocalSession(request, token) ? null : NextResponse.json({ error: "登录已过期，请重新登录" }, { status: 401 }); }
  catch { return NextResponse.json({ error: "登录服务不可用" }, { status: 503 }); }
}

export async function requirePermission(request: NextRequest, permissions: string[], mode: "all" | "any" = "all") {
  const token = request.cookies.get("junyang_session")?.value;
  if (!token) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  try {
    const access = await requestLocalSession(request, token);
    if (!access) return NextResponse.json({ error: "登录已过期，请重新登录" }, { status: 401 });
    const allowed = mode === "all" ? permissions.every((key) => access.permissions[key]) : permissions.some((key) => access.permissions[key]);
    return access.administrator || allowed ? null : NextResponse.json({ error: "当前账号没有访问该功能的权限" }, { status: 403 });
  } catch { return NextResponse.json({ error: "权限服务不可用" }, { status: 503 }); }
}

export async function requireAdministrator(request: NextRequest) {
  const token = request.cookies.get("junyang_session")?.value;
  if (!token) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  try {
    const access = await requestLocalSession(request, token);
    if (!access) return NextResponse.json({ error: "登录已过期，请重新登录" }, { status: 401 });
    return access.administrator ? null : NextResponse.json({ error: "只有管理员可以执行此操作" }, { status: 403 });
  } catch { return NextResponse.json({ error: "权限服务不可用" }, { status: 503 }); }
}

export async function roleManager(request: NextRequest): Promise<boolean> {
  return !(await requireAdministrator(request));
}
