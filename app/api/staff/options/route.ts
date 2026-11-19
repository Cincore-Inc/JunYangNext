import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getMysql } from "@/lib/mysql";
import { requirePermission } from "@/lib/session";

export async function GET(request: NextRequest) {
  const denied = await requirePermission(request, ["staff_view", "certificate_view", "salarydetail_view", "insurancedetail_view"], "any");
  if (denied) return denied;
  const q = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 100).replace(/[\\%_]/g, "\\$&");
  try {
    const [items] = await getMysql().execute<RowDataPacket[]>("SELECT id, name FROM staff_staff WHERE name LIKE ? ORDER BY id DESC LIMIT 50", [`%${q}%`]);
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "无法读取人员选项" }, { status: 503 }); }
}
