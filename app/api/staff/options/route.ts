import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getMysql } from "@/lib/mysql";
import { requirePermission } from "@/lib/session";
import { pinyin } from "pinyin-pro";

export async function GET(request: NextRequest) {
  const denied = await requirePermission(request, ["staff_view", "certificate_view", "salarydetail_view", "insurancedetail_view"], "any");
  if (denied) return denied;
  const input = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
  const q = input.replace(/[\\%_]/g, "\\$&");
  try {
    const db = getMysql();
    const [items] = await db.execute<RowDataPacket[]>("SELECT id, name FROM staff_staff WHERE name LIKE ? OR name_pinyin LIKE ? ORDER BY id DESC LIMIT 50", [`%${q}%`, `%${q}%`]);
    if (/^[a-z]+$/i.test(input)) {
      const [missing] = await db.execute<RowDataPacket[]>("SELECT id, name FROM staff_staff WHERE (name_pinyin IS NULL OR name_pinyin = '') AND name IS NOT NULL ORDER BY id DESC");
      const existing = new Set(items.map(item => item.id));
      for (const item of missing) {
        if (!existing.has(item.id) && pinyin(item.name, { pattern: "first", toneType: "none", type: "array" }).join("").toLowerCase().includes(input.toLowerCase())) items.push(item);
      }
      items.sort((a, b) => b.id - a.id);
      items.length = Math.min(items.length, 50);
    }
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "无法读取人员选项" }, { status: 503 }); }
}
