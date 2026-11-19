import { Long } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { getMongo } from "@/lib/db";
import { financeReferences } from "@/lib/finance-refs";
import { parseMoney } from "@/lib/money.mjs";
import { requirePermission } from "@/lib/session";
import { sameOrigin } from "@/lib/write-request";
import { invoiceExtra, transactionExtra } from "@/lib/finance-fields";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const denied = await requirePermission(request, ["finance_view"]);
  if (denied) return denied;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
  const day = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? new Date(`${body.date}T00:00:00+08:00`) : null;
  if (!["transactions", "receipts", "invoices"].includes(body.kind) || (body.date != null && typeof body.date !== "string") || (body.date && (!day || Number.isNaN(day.getTime()) || new Date(day.getTime() + 8 * 3600000).toISOString().slice(0, 10) !== body.date))) return NextResponse.json({ error: "类型或日期无效" }, { status: 400 });
  const isTransaction = body.kind === "transactions";
  if (!isTransaction && body.index != null && (!Number.isSafeInteger(body.index) || body.index < 0 || body.index > 2147483647)) return NextResponse.json({ error: "票据编号无效" }, { status: 400 });
  if (!isTransaction && body.projectNumber != null && (!Number.isSafeInteger(body.projectNumber) || body.projectNumber < 0 || body.projectNumber > 2147483647)) return NextResponse.json({ error: "工程编号无效" }, { status: 400 });
  const amount = parseMoney(body.amount ?? "0"), net = parseMoney(body.amountWithoutTax ?? "0"), tax = parseMoney(body.tax ?? "0");
  const extra = transactionExtra(body);
  const invoiceFields = !isTransaction ? invoiceExtra(body, body.kind) : {};
  if (isTransaction ? !extra || amount === null || (body.type !== undefined && (typeof body.type !== "string" || body.type.length > 80)) || (body.title !== undefined && (typeof body.title !== "string" || body.title.length > 10000)) : !invoiceFields || net === null || tax === null || !Number.isSafeInteger(net + tax) || (body.number !== undefined && (typeof body.number !== "string" || body.number.length > 100)) || (body.party !== undefined && (typeof body.party !== "string" || body.party.length > 10000)) || (body.ticketClass !== undefined && (typeof body.ticketClass !== "string" || body.ticketClass.length > 100)) || !["有效", "作废", "已抵扣", "未交票", "未设置"].includes(body.ticketStatus ?? "有效")) return NextResponse.json({ error: "请正确填写财务信息" }, { status: 400 });
  try {
    const refs = await financeReferences(body.projectId, body.companyId);
    if (!refs) return NextResponse.json({ error: "项目或公司不存在" }, { status: 400 });
    const now = new Date();
    const common = { ...(refs.project ? { project: refs.project } : {}), ...(refs.company ? { company: refs.company } : {}), status: "未对账", createdAt: now, updatedAt: now, __v: 0 };
    const collection = (await getMongo()).db("junyang-finance").collection(body.kind);
    let index = body.index;
    if (!isTransaction && !index && refs.company && day) {
      const [year, month] = body.date.split("-").map(Number);
      const start = new Date(Date.UTC(year, month - 1, 1) - 28800000);
      const end = new Date(Date.UTC(year, month, 1) - 28800000);
      index = await collection.countDocuments({ "company.value": refs.company.value, date: { $gte: start, $lt: end } }, { maxTimeMS: 10000 }) + 1;
    }
    const projectNumber = body.projectNumber !== undefined ? body.projectNumber : refs.projectNumber;
    const record = isTransaction ? { ...common, ...extra, ...(day ? { transactionDate: day } : {}), ...(body.type?.trim() ? { transactionType: body.type.trim() } : {}), title: (body.title || "").trim(), amount: Long.fromNumber(amount!), ...(amount === 0 ? {} : { direction: amount! > 0 ? "income" : "outgoing" }) } : { ...common, ...invoiceFields, ...(index != null ? { index } : {}), ...(projectNumber !== undefined ? { projectNumber } : {}), ...(day ? { date: day } : {}), ...(body.number?.trim() ? { [body.kind === "receipts" ? "receiptId" : "invoiceId"]: body.number.trim() } : {}), [body.kind === "receipts" ? "issuer" : "buyer"]: (body.party || "").trim(), ticketClass: (body.ticketClass || "").trim(), ticketStatus: body.ticketStatus === "未设置" ? null : body.ticketStatus || "有效", amountWithoutTax: Long.fromNumber(net!), tax: Long.fromNumber(tax!), amount: Long.fromNumber(net! + tax!), taxRate: (net === 0 ? "0" : (tax! / net! * 100).toFixed(2)) + "%", ...(body.kind === "receipts" ? { receipts: [], otherFiles: [], transferRecords: [] } : body.kind === "invoices" ? { invoices: [] } : {}) };
    const inserted = await collection.insertOne(record, { maxTimeMS: 10000 });
    return NextResponse.json({ ok: true, id: inserted.insertedId.toString() });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return NextResponse.json({ error: "发票号码已存在" }, { status: 409 });
    return NextResponse.json({ error: "保存结果未知，请刷新列表确认后再试" }, { status: 503 });
  }
}
