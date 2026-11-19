import { NextRequest, NextResponse } from "next/server";
import { getMongo } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { financeFilter } from "@/lib/finance-filter.mjs";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind");
  if (!["transactions", "receipts", "invoices"].includes(kind || "")) return NextResponse.json({ error: "数据类型无效" }, { status: 400 });
  const scopedBills = kind !== "transactions" && /^[a-f\d]{24}$/i.test(request.nextUrl.searchParams.get("projectId") || "");
  const denied = await requirePermission(request, scopedBills ? ["finance_view", "project_bill_view"] : ["finance_view"], scopedBills ? "any" : "all");
  if (denied) return denied;
  const matrix = request.nextUrl.searchParams.get("mode") === "invoiceMatrix";
  const transactionMatrix = request.nextUrl.searchParams.get("mode") === "transactionMatrix";
  if (matrix && kind === "transactions") return NextResponse.json({ error: "汇总类型无效" }, { status: 400 });
  if (transactionMatrix && kind !== "transactions") return NextResponse.json({ error: "汇总类型无效" }, { status: 400 });
  const group = request.nextUrl.searchParams.get("group") || (matrix ? "company" : "type");
  const groupFields: Record<string, string> = { type: kind === "transactions" ? "$transactionType" : "$ticketClass", project: "$project.label", company: "$company.label", account: "$accountName", opposite: "$oppositeAccountName" };
  if (matrix ? !["company", "project", "ticketStatus", "deductDate"].includes(group) : (!groupFields[group] || (kind !== "transactions" && ["account", "opposite"].includes(group)))) return NextResponse.json({ error: "汇总维度无效" }, { status: 400 });
  let filter;
  try { filter = financeFilter(request.nextUrl.searchParams, kind!); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "筛选条件无效" }, { status: 400 }); }
  try {
    const collection = (await getMongo()).db("junyang-finance").collection(kind!);
    if (transactionMatrix) {
      const conditional = (direction: string, status: string) => ({ $sum: { $cond: [{ $and: [{ $eq: ["$direction", direction] }, { $eq: ["$status", status] }] }, { $ifNull: ["$amount", 0] }, 0] } });
      const referenceGroup = group === "project" || group === "company";
      const groupId = referenceGroup ? { $ifNull: [`$${group}.value`, { $concat: ["label:", { $ifNull: [`$${group}.label`, "未设置"] }] }] } : groupFields[group];
      const rows = await collection.aggregate([
        { $match: { ...filter, direction: filter.direction || { $exists: true } } },
        { $group: { _id: groupId, name: { $first: referenceGroup ? `$${group}.label` : groupFields[group] }, outgoingUnverified: conditional("outgoing", "未对账"), incomingUnverified: conditional("income", "未对账"), outgoingVerified: conditional("outgoing", "已对账"), incomingVerified: conditional("income", "已对账") } },
        { $sort: { _id: 1 } },
      ], { maxTimeMS: 10000 }).toArray();
      return NextResponse.json({ items: rows.map((row, id) => {
        const outgoingUnverified = Number(row.outgoingUnverified), incomingUnverified = Number(row.incomingUnverified), outgoingVerified = Number(row.outgoingVerified), incomingVerified = Number(row.incomingVerified);
        const outgoing = outgoingUnverified + outgoingVerified, incoming = incomingUnverified + incomingVerified;
        return { id, name: row.name || "未设置", outgoing, incoming, total: outgoing + incoming, outgoingUnverified, incomingUnverified, unverifiedTotal: outgoingUnverified + incomingUnverified, outgoingVerified, incomingVerified, verifiedTotal: outgoingVerified + incomingVerified };
      }) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (matrix) {
      const by = group === "deductDate" ? { $dateToString: { format: "%Y-%m", date: "$deductDate", timezone: "Asia/Shanghai", onNull: "未设置" } } : group === "ticketStatus" ? "$ticketStatus" : { $ifNull: [`$${group}.value`, { $concat: ["label:", { $ifNull: [`$${group}.label`, "未设置"] }] }] };
      const conditional = (ticketClass: string, field: string) => ({ $sum: { $cond: [{ $eq: ["$ticketClass", ticketClass] }, { $ifNull: [`$${field}`, 0] }, 0] } });
      const rows = await collection.aggregate([
        { $match: filter },
        { $group: { _id: by, name: { $first: group === "company" || group === "project" ? `$${group}.label` : by }, specialTax: conditional("专票", "tax"), specialGross: conditional("专票", "amountWithoutTax"), specialTotal: conditional("专票", "amount"), ordinaryTax: conditional("普票", "tax"), ordinaryGross: conditional("普票", "amountWithoutTax"), ordinaryTotal: conditional("普票", "amount") } },
        { $sort: { _id: 1 } },
      ], { maxTimeMS: 10000 }).toArray();
      return NextResponse.json({ items: rows.map((row, index) => ({ id: index, name: row.name || row._id || "未设置", specialTax: Number(row.specialTax), specialGross: Number(row.specialGross), specialTotal: Number(row.specialTotal), ordinaryTax: Number(row.ordinaryTax), ordinaryGross: Number(row.ordinaryGross), ordinaryTotal: Number(row.ordinaryTotal), tax: Number(row.specialTax) + Number(row.ordinaryTax), gross: Number(row.specialGross) + Number(row.ordinaryGross), total: Number(row.specialTotal) + Number(row.ordinaryTotal) })) }, { headers: { "Cache-Control": "no-store" } });
    }
    const rows = await collection.aggregate([
      { $match: filter },
      { $group: { _id: kind === "transactions" ? { type: groupFields[group], direction: "$direction", status: "$status" } : { type: groupFields[group], ticketClass: "$ticketClass", status: "$status" }, count: { $sum: 1 }, amount: { $sum: "$amount" }, tax: { $sum: "$tax" }, amountWithoutTax: { $sum: "$amountWithoutTax" } } },
      { $sort: { "_id.type": 1, "_id.status": 1, "_id.direction": 1 } },
    ], { maxTimeMS: 10000 }).toArray();
    return NextResponse.json({ items: rows.map((row, index) => ({ id: index, type: row._id.type || "未设置", ticketClass: row._id.ticketClass || "未设置", direction: row._id.direction || "", status: row._id.status || "未设置", count: row.count, amount: Number(row.amount), tax: Number(row.tax), amountWithoutTax: Number(row.amountWithoutTax) })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Finance summary failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "无法读取财务汇总，请检查数据库连接。" }, { status: 503 });
  }
}
