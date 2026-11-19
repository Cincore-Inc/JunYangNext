import { Long, ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { getMongo } from "@/lib/db";
import { parseMoney } from "@/lib/money.mjs";
import { requirePermission } from "@/lib/session";
import { sameOrigin } from "@/lib/write-request";
import { financeDate, invoiceExtra } from "@/lib/finance-fields";
import { financeProjectReference, financeCompanyReference } from "@/lib/finance-refs";

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const denied = await requirePermission(request, ["finance_view"]);
  if (denied) return denied;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
  const net = parseMoney(body.amountWithoutTax), tax = parseMoney(body.tax);
  const extra = ["receipts", "invoices"].includes(body.kind) ? invoiceExtra(body, body.kind) : null;
  const day = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? new Date(`${body.date}T00:00:00+08:00`) : null;
  const version = typeof body.updatedAt === "string" ? new Date(body.updatedAt) : null;
  let verifiedAt: Date | null | undefined;
  try { verifiedAt = financeDate(body.verifiedAt); } catch { return NextResponse.json({ error: "对账日期无效" }, { status: 400 }); }
  for (const field of ["index", "projectNumber"]) if (body[field] !== undefined && body[field] !== null && (!Number.isSafeInteger(body[field]) || body[field] < 0 || body[field] > 2147483647)) return NextResponse.json({ error: "票据编号无效" }, { status: 400 });
  if (!extra || typeof body.id !== "string" || !/^[a-f\d]{24}$/i.test(body.id) || net === null || tax === null || !Number.isSafeInteger(net + tax) || (body.date !== undefined && (!day || Number.isNaN(day.getTime()) || new Date(day.getTime() + 8 * 3600000).toISOString().slice(0, 10) !== body.date)) || !version || Number.isNaN(version.getTime()) || (body.number !== undefined && (typeof body.number !== "string" || !body.number.trim() || body.number.length > 100)) || typeof body.party !== "string" || body.party.length > 200 || typeof body.ticketClass !== "string" || body.ticketClass.length > 100 || !["有效", "作废", "已抵扣", "未交票", "未设置"].includes(body.ticketStatus) || !["未对账", "已对账", "未设置"].includes(body.status)) return NextResponse.json({ error: "请正确填写发票信息" }, { status: 400 });
  try {
    const collection = (await getMongo()).db("junyang-finance").collection(body.kind);
    const filter = { _id: new ObjectId(body.id), updatedAt: version };
    const existing = await collection.findOne(filter, { projection: { date: 1, issueDate: 1, deductDate: 1, submitDate: 1, status: 1, verifiedAt: 1, index: 1, company: 1 }, maxTimeMS: 10000 });
    if (!existing) return NextResponse.json({ error: "记录已对账、已变化或不存在，请刷新后重试" }, { status: 409 });
    const [project, company] = await Promise.all([body.projectId !== undefined ? financeProjectReference(body.projectId) : undefined, body.companyId !== undefined ? financeCompanyReference(body.companyId) : undefined]);
    if ((body.projectId !== undefined && !project) || (body.companyId !== undefined && !company)) return NextResponse.json({ error: "项目或公司不存在" }, { status: 400 });
    let index = body.index === undefined ? existing.index : body.index;
    const companyId = company?.value || existing.company?.value;
    const effectiveDate = body.date || (existing.date instanceof Date ? new Date(existing.date.getTime() + 8 * 3600000).toISOString().slice(0, 10) : "");
    if (!index && typeof companyId === "string" && companyId && effectiveDate) {
      const [year, month] = effectiveDate.split("-").map(Number);
      const start = new Date(Date.UTC(year, month - 1, 1) - 28800000);
      const end = new Date(Date.UTC(year, month, 1) - 28800000);
      index = await collection.countDocuments({ _id: { $ne: new ObjectId(body.id) }, "company.value": companyId, date: { $gte: start, $lt: end } }, { maxTimeMS: 10000 }) + 1;
    }
    const previousDate = existing.date instanceof Date ? new Date(existing.date.getTime() + 8 * 3600000).toISOString().slice(0, 10) : "";
    for (const key of ["issueDate", "deductDate", "submitDate"]) {
      if (extra[key] instanceof Date && existing[key] instanceof Date && new Date((extra[key] as Date).getTime() + 8 * 3600000).toISOString().slice(0, 10) === new Date(existing[key].getTime() + 8 * 3600000).toISOString().slice(0, 10)) extra[key] = existing[key];
    }
    const now = new Date(Math.max(Date.now(), version.getTime() + 1));
    const result = await collection.updateOne(filter, { $set: { ...extra, ...(project ? { project: project.ref } : {}), ...(company ? { company } : {}), ...(index !== undefined ? { index } : {}), ...(body.projectNumber !== undefined ? { projectNumber: body.projectNumber } : {}), ...(body.date !== undefined ? { date: previousDate === body.date ? existing.date : day } : {}), ...(body.number !== undefined ? { [body.kind === "receipts" ? "receiptId" : "invoiceId"]: body.number.trim() } : {}), [body.kind === "receipts" ? "issuer" : "buyer"]: body.party.trim(), ticketClass: body.ticketClass.trim(), ticketStatus: body.ticketStatus === "未设置" ? null : body.ticketStatus, amountWithoutTax: Long.fromNumber(net), tax: Long.fromNumber(tax), amount: Long.fromNumber(net + tax), taxRate: (net === 0 ? "0" : (tax / net * 100).toFixed(2)) + "%", status: body.status === "未设置" ? null : body.status, updatedAt: now, ...(verifiedAt !== undefined ? { verifiedAt } : body.status === "已对账" && existing.status !== "已对账" ? { verifiedAt: now } : {}) } }, { maxTimeMS: 10000 });
    if (!result.matchedCount) return NextResponse.json({ error: "记录已对账或已变化，请刷新后重试" }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return NextResponse.json({ error: "发票号码已存在" }, { status: 409 });
    return NextResponse.json({ error: "保存结果未知，请刷新列表确认后再试" }, { status: 503 });
  }
}
