import { Long, ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { getMongo } from "@/lib/db";
import { parseMoney } from "@/lib/money.mjs";
import { requirePermission } from "@/lib/session";
import { sameOrigin } from "@/lib/write-request";
import { financeDate, transactionExtra } from "@/lib/finance-fields";
import { financeProjectReference, financeCompanyReference } from "@/lib/finance-refs";

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const denied = await requirePermission(request, ["finance_view"]);
  if (denied) return denied;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
  const amount = parseMoney(body.amount);
  const extra = transactionExtra(body);
  let day: Date | null | undefined;
  try { day = financeDate(body.date); } catch { return NextResponse.json({ error: "交易日期无效" }, { status: 400 }); }
  const version = typeof body.updatedAt === "string" ? new Date(body.updatedAt) : null;
  let verifiedAt: Date | null | undefined;
  try { verifiedAt = financeDate(body.verifiedAt); } catch { return NextResponse.json({ error: "对账日期无效" }, { status: 400 }); }
  if (!extra || typeof body.id !== "string" || !/^[a-f\d]{24}$/i.test(body.id) || amount === null || !version || Number.isNaN(version.getTime()) || (body.type !== undefined && (typeof body.type !== "string" || body.type.length > 80)) || typeof body.title !== "string" || body.title.length > 10000 || !["未对账", "已对账", "未设置"].includes(body.status)) return NextResponse.json({ error: "请正确填写交易信息" }, { status: 400 });
  try {
    const collection = (await getMongo()).db("junyang-finance").collection("transactions");
    const filter = { _id: new ObjectId(body.id), updatedAt: version, status: { $ne: "已对账" } };
    const existing = await collection.findOne(filter, { projection: { transactionDate: 1, verifiedAt: 1 }, maxTimeMS: 10000 });
    if (!existing) return NextResponse.json({ error: "记录已对账、已变化或不存在，请刷新后重试" }, { status: 409 });
    const [project, company] = await Promise.all([body.projectId !== undefined ? financeProjectReference(body.projectId) : undefined, body.companyId !== undefined ? financeCompanyReference(body.companyId) : undefined]);
    if ((body.projectId !== undefined && !project) || (body.companyId !== undefined && !company)) return NextResponse.json({ error: "项目或公司不存在" }, { status: 400 });
    const previousDate = existing.transactionDate instanceof Date ? new Date(existing.transactionDate.getTime() + 8 * 3600000).toISOString().slice(0, 10) : "";
    const now = new Date(Math.max(Date.now(), version.getTime() + 1));
    const result = await collection.updateOne(filter, { $set: { ...extra, ...(project ? { project: project.ref } : {}), ...(company ? { company } : {}), amount: Long.fromNumber(amount), ...(body.date !== undefined ? { transactionDate: day && previousDate === body.date ? existing.transactionDate : day } : {}), ...(body.type !== undefined ? { transactionType: body.type.trim() } : {}), title: body.title.trim(), ...(amount === 0 ? {} : { direction: amount > 0 ? "income" : "outgoing" }), status: body.status === "未设置" ? null : body.status, updatedAt: now, ...(verifiedAt !== undefined ? { verifiedAt } : body.status === "已对账" && !existing.verifiedAt ? { verifiedAt: now } : {}) } }, { maxTimeMS: 10000 });
    if (!result.matchedCount) return NextResponse.json({ error: "记录已对账、已变化或不存在，请刷新后重试" }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "保存结果未知，请刷新列表确认后再试" }, { status: 503 }); }
}
