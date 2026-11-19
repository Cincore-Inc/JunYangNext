import { requirePermission } from "@/lib/session";
import { attachmentRefs } from "@/lib/attachments";
import { getMongo } from "@/lib/db";
import { financeFilter } from "@/lib/finance-filter.mjs";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const kind = params.get("kind") || "receipts";
  if (!["receipts", "invoices", "transactions"].includes(kind)) return NextResponse.json({ error: "数据类型无效" }, { status: 400 });
  const scopedBills = kind !== "transactions" && /^[a-f\d]{24}$/i.test(params.get("projectId") || "");
  const denied = await requirePermission(request, scopedBills ? ["finance_view", "project_bill_view"] : ["finance_view"], scopedBills ? "any" : "all");
  if (denied) return denied;
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.get("page") || "1", 10) || 1));
  const pageSize = Number(params.get("pageSize") || 25);
  if (![2, 25, 50, 100, 200, 300, 400].includes(pageSize)) return NextResponse.json({ error: "每页条数无效" }, { status: 400 });
  const sortName = params.get("sort") || "createdDesc";
  const dateField = kind === "transactions" ? "transactionDate" : "date";
  const sorts = { createdDesc: { createdAt: -1, _id: -1 }, dateDesc: { [dateField]: -1, _id: -1 }, dateAsc: { [dateField]: 1, _id: 1 }, amountDesc: { amount: -1, _id: -1 }, amountAsc: { amount: 1, _id: 1 } } as const;
  const sort = sorts[sortName as keyof typeof sorts] || sorts.createdDesc;
  let filter;
  try { filter = financeFilter(params, kind); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "筛选条件无效" }, { status: 400 }); }
  try {
    const client = await getMongo();
    const collection = client.db("junyang-finance").collection(kind);
    const [totals, rows] = await Promise.all([
      collection.aggregate([{ $match: filter }, { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: kind === "transactions" ? { $cond: [{ $ne: [{ $type: "$direction" }, "missing"] }, "$amount", 0] } : "$amount" }, amountWithoutTax: { $sum: "$amountWithoutTax" }, tax: { $sum: "$tax" } } }], { maxTimeMS: 10000 }).toArray(),
      collection.find(filter, { projection: { index: 1, projectNumber: 1, taxRate: 1, verifiedAt: 1, project: 1, company: 1, amount: 1, amountWithoutTax: 1, tax: 1, date: 1, transactionDate: 1, invoiceId: 1, receiptId: 1, issuer: 1, buyer: 1, ticketClass: 1, ticketStatus: 1, status: 1, direction: 1, transactionType: 1, title: 1, name: 1, accountName: 1, channel: 1, oppositeName: 1, oppositeAccountName: 1, oppositeChannel: 1, note: 1, todo: 1, person: 1, receiptType: 1, storagePlace: 1, tags: 1, purpose: 1, taxCode: 1, issueDate: 1, deductDate: 1, submitDate: 1, updatedAt: 1, receipts: 1, otherFiles: 1, contract: 1, license: 1, ownerId: 1, bankCertificate: 1, receipt: 1 } }).sort(sort).skip((page - 1) * pageSize).limit(pageSize).maxTimeMS(10000).toArray(),
    ]);
    const aggregate = totals[0];
    return NextResponse.json({ total: aggregate?.count || 0, summary: { amount: Number(aggregate?.amount || 0), amountWithoutTax: Number(aggregate?.amountWithoutTax || 0), tax: Number(aggregate?.tax || 0) }, items: rows.map((row) => ({ id: String(row._id), index: row.index ?? null, projectNumber: row.projectNumber ?? null, taxRate: row.taxRate || "", verifiedAt: row.verifiedAt || null, projectId: row.project?.value || "", companyId: row.company?.value || "", project: row.project?.label || row.project?.name || "—", company: row.company?.label || row.company?.name || "—", amount: Number(row.amount ?? 0), amountWithoutTax: Number(row.amountWithoutTax ?? 0), tax: Number(row.tax ?? 0), party: kind === "receipts" ? row.issuer || "" : row.buyer || "", ticketClass: row.ticketClass || "", date: row.transactionDate || row.date || null, updatedAt: row.updatedAt || null, number: row.invoiceId || row.receiptId || "", ticketStatus: row.ticketStatus || "未设置", status: row.status || "未设置", direction: row.direction || "", type: row.transactionType || "", title: row.title || "", name: row.name || "", accountName: row.accountName || "", channel: row.channel || "", oppositeName: row.oppositeName || "", oppositeAccountName: row.oppositeAccountName || "", oppositeChannel: row.oppositeChannel || "", note: row.note || "", todo: row.todo || "", person: row.person || "", receiptType: row.receiptType || "", storagePlace: row.storagePlace || "", tags: row.tags || "", purpose: row.purpose || "", taxCode: row.taxCode || "", issueDate: row.issueDate || null, deductDate: row.deductDate || null, submitDate: row.submitDate || null, files: attachmentRefs(row, kind === "receipts" ? ["receipts", "otherFiles", "contract", "license", "ownerId", "bankCertificate"] : kind === "transactions" ? ["receipt"] : []) })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Finance query failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "无法读取财务数据，请检查数据库连接和 SSH 隧道。" }, { status: 503 });
  }
}
