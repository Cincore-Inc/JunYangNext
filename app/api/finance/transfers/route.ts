import { Long, ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { getMongo } from "@/lib/db";
import { parseMoney } from "@/lib/money.mjs";
import { requirePermission } from "@/lib/session";
import { sameOrigin } from "@/lib/write-request";

export async function GET(request: NextRequest) {
  const denied = await requirePermission(request, ["finance_view", "project_bill_view"], "any");
  if (denied) return denied;
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!/^[a-f\d]{24}$/i.test(id)) return NextResponse.json({ error: "收票编号无效" }, { status: 400 });
  try {
    const row = await (await getMongo()).db("junyang-finance").collection("receipts").findOne({ _id: new ObjectId(id) }, { projection: { transferRecords: 1, updatedAt: 1, status: 1 }, maxTimeMS: 10000 });
    if (!row) return NextResponse.json({ error: "收票不存在" }, { status: 404 });
    const records = Array.isArray(row.transferRecords) ? row.transferRecords : [];
    return NextResponse.json({ updatedAt: row.updatedAt || null, status: row.status || "未设置", items: records.map((item, index) => ({ id: String(item._id || ""), date: item.date || null, amount: Number(item.amount ?? 0), note: item.note || "", hasFile: Boolean(item.file), extension: typeof item.file === "string" && item.file.includes(".") ? item.file.split(".").pop()?.toLowerCase() || "" : "", index })) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "无法读取转账记录" }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const denied = await requirePermission(request, ["finance_view"]);
  if (denied) return denied;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
  const version = typeof body.updatedAt === "string" ? new Date(body.updatedAt) : null;
  if (typeof body.receiptId !== "string" || !/^[a-f\d]{24}$/i.test(body.receiptId) || !version || Number.isNaN(version.getTime()) || !["create", "edit", "delete"].includes(body.action) || (body.action !== "create" && (typeof body.id !== "string" || !/^[a-f\d]{24}$/i.test(body.id)))) return NextResponse.json({ error: "参数无效" }, { status: 400 });
  const amount = body.action === "delete" ? null : parseMoney(body.amount);
  const day = body.action === "delete" ? null : typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? new Date(`${body.date}T00:00:00+08:00`) : null;
  if (body.action !== "delete" && (amount === null || (body.date !== "" && (!day || Number.isNaN(day.getTime()) || new Date(day.getTime() + 8 * 3600000).toISOString().slice(0, 10) !== body.date)) || typeof body.note !== "string" || body.note.length > 10000)) return NextResponse.json({ error: "请正确填写转账记录" }, { status: 400 });
  try {
    const collection = (await getMongo()).db("junyang-finance").collection("receipts");
    const filter = { _id: new ObjectId(body.receiptId), updatedAt: version };
    const row = await collection.findOne(filter, { projection: { transferRecords: 1, deletedTransferRecords: 1 }, maxTimeMS: 10000 });
    if (!row) return NextResponse.json({ error: "记录已变化，请刷新后重试" }, { status: 409 });
    if (row.transferRecords !== undefined && !Array.isArray(row.transferRecords)) return NextResponse.json({ error: "转账记录格式异常" }, { status: 409 });
    if (row.deletedTransferRecords !== undefined && !Array.isArray(row.deletedTransferRecords)) return NextResponse.json({ error: "删除记录格式异常" }, { status: 409 });
    const records = [...(row.transferRecords || [])];
    let deletedRecord = null;
    if (body.action === "create") records.push({ _id: new ObjectId(), amount: Long.fromNumber(amount!), date: day, note: body.note.trim() });
    else {
      const index = records.findIndex((item) => String(item._id) === body.id);
      if (index < 0) return NextResponse.json({ error: "转账记录不存在" }, { status: 404 });
      if (body.action === "delete") deletedRecord = { ...records.splice(index, 1)[0], deletedAt: new Date() };
      else {
        const original = records[index];
        const oldDate = original.date instanceof Date ? new Date(original.date.getTime() + 8 * 3600000).toISOString().slice(0, 10) : "";
        records[index] = { ...original, amount: Long.fromNumber(amount!), ...(day ? { date: oldDate === body.date ? original.date : day } : original.date != null ? { date: null } : {}), ...(body.note === (original.note || "") ? {} : { note: body.note.trim() }) };
      }
    }
    const result = await collection.updateOne(filter, { $set: { transferRecords: records, updatedAt: new Date(), ...(deletedRecord ? { deletedTransferRecords: [...(row.deletedTransferRecords || []), deletedRecord] } : {}) } }, { maxTimeMS: 10000 });
    return result.matchedCount ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "记录已变化，请刷新后重试" }, { status: 409 });
  } catch { return NextResponse.json({ error: "保存结果未知，请刷新后确认" }, { status: 503 }); }
}
