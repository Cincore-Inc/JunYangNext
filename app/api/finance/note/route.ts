import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { getMongo } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { sameOrigin } from "@/lib/write-request";

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const denied = await requirePermission(request, ["finance_view"]);
  if (denied) return denied;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
  const version = typeof body.updatedAt === "string" ? new Date(body.updatedAt) : null;
  if (!["transactions", "receipts", "invoices"].includes(body.kind) || typeof body.id !== "string" || !/^[a-f\d]{24}$/i.test(body.id) || typeof body.note !== "string" || body.note.length > 10000 || !version || Number.isNaN(version.getTime())) return NextResponse.json({ error: "备注信息无效" }, { status: 400 });
  try {
    const result = await (await getMongo()).db("junyang-finance").collection(body.kind).updateOne({ _id: new ObjectId(body.id), updatedAt: version }, { $set: { note: body.note.trim(), updatedAt: new Date() } }, { maxTimeMS: 10000 });
    return result.matchedCount ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "记录已变化或不存在，请刷新后重试" }, { status: 409 });
  } catch { return NextResponse.json({ error: "保存结果未知，请刷新后确认" }, { status: 503 }); }
}
