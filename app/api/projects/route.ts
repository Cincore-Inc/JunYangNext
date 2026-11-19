import { requirePermission } from "@/lib/session";
import { getMongo } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requirePermission(request, ["project_all_view"]);
  if (denied) return denied;
  const financeDenied = await requirePermission(request, ["finance_view", "project_bill_view"], "any");
  if (financeDenied && financeDenied.status !== 403) return financeDenied;
  try {
    const page = Math.max(1, Math.min(10000, Number.parseInt(request.nextUrl.searchParams.get("page") || "1", 10) || 1));
    const size = Number(request.nextUrl.searchParams.get("pageSize") || "25");
    if (![2, 25, 50, 100, 200, 300, 400].includes(size)) return NextResponse.json({ error: "每页条数无效" }, { status: 400 });
    const query = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const status = (request.nextUrl.searchParams.get("status") || "").slice(0, 100);
    const won = request.nextUrl.searchParams.get("won") === "1";
    const bidStatuses = (request.nextUrl.searchParams.get("bidStatuses") || "").split(",").filter(Boolean);
    const bidMethods = (request.nextUrl.searchParams.get("bidMethods") || "").split(",").filter(Boolean);
    if (bidStatuses.some((value) => !["投标中", "已中标", "未中标"].includes(value)) || bidMethods.some((value) => !["低价中标", "邀标低价", "库内低价", "抽选", "电子标", "综合评选"].includes(value))) return NextResponse.json({ error: "筛选条件无效" }, { status: 400 });
    const number = (request.nextUrl.searchParams.get("number") || "").trim();
    if (number && (!/^\d+$/.test(number) || !Number.isSafeInteger(Number(number)))) return NextResponse.json({ error: "项目编号无效" }, { status: 400 });
    const winner = (request.nextUrl.searchParams.get("winner") || "").trim().slice(0,100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const winnerId = request.nextUrl.searchParams.get("winnerId") || "";
    const winnerLabel = request.nextUrl.searchParams.get("winnerLabel") || "";
    if ((winnerId && !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(winnerId)) || winnerLabel.length > 200 || (!!winnerId !== !!winnerLabel)) return NextResponse.json({ error: "中标公司参数无效" }, { status: 400 });
    const bidder = (request.nextUrl.searchParams.get("bidder") || "").trim().slice(0,100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const from = request.nextUrl.searchParams.get("from") || "", to = request.nextUrl.searchParams.get("to") || "";
    const parseDate = (value: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null; const d = new Date(`${value}T00:00:00+08:00`); return !Number.isNaN(d.getTime()) && new Date(d.getTime() + 28800000).toISOString().slice(0,10) === value ? d : null; };
    const endFrom = request.nextUrl.searchParams.get("endFrom") || "", endTo = request.nextUrl.searchParams.get("endTo") || "";
    const start = from ? parseDate(from) : null, end = to ? parseDate(to) : null, finishStart = endFrom ? parseDate(endFrom) : null, finishEnd = endTo ? parseDate(endTo) : null;
    if ((from && !start) || (to && !end) || (endFrom && !finishStart) || (endTo && !finishEnd) || (start && end && start > end) || (finishStart && finishEnd && finishStart > finishEnd)) return NextResponse.json({ error: won ? "开工或完工日期无效" : "开标日期无效" }, { status: 400 });
    const sortKey = request.nextUrl.searchParams.get("sort") || "createdDesc";
    const sorts = { createdDesc: { createdAt: -1, _id: -1 }, updatedDesc: { updatedAt: -1, _id: -1 }, updatedAsc: { updatedAt: 1, _id: 1 }, numberDesc: { projectNumber: -1, _id: -1 }, numberAsc: { projectNumber: 1, _id: 1 }, nameAsc: { name: 1, _id: 1 }, nameDesc: { name: -1, _id: -1 } } as const;
    const sort = sorts[sortKey as keyof typeof sorts] || sorts.createdDesc;
    const filter = {
      ...(won ? { bidStatus: "已中标" } : bidStatuses.length ? { bidStatus: { $in: bidStatuses } } : {}), ...(bidMethods.length ? { bidMethod: { $in: bidMethods } } : {}),
      ...(number ? { projectNumber: Number(number) } : {}), ...(winnerId ? { "winner.value": winnerId } : winner ? { "winner.label": { $regex: winner, $options: "i" } } : {}), ...(bidder ? { "bidderCompanies.name": { $regex: bidder, $options: "i" } } : {}), ...(start || end ? { [won ? "projectStart" : "bidStartTime"]: { ...(start && { $gte: start }), ...(end && { $lt: new Date(end.getTime() + 86400000) }) } } : {}), ...(won && (finishStart || finishEnd) ? { projectEnd: { ...(finishStart && { $gte: finishStart }), ...(finishEnd && { $lt: new Date(finishEnd.getTime() + 86400000) }) } } : {}),
      ...(query ? { $or: [{ name: { $regex: escaped, $options: "i" } }, { namePY: { $regex: escaped, $options: "i" } }, { tags: { $regex: escaped, $options: "i" } }, { person: { $regex: escaped, $options: "i" } }, { purpose: { $regex: escaped, $options: "i" } }, { title: { $regex: escaped, $options: "i" } }, { issuer: { $regex: escaped, $options: "i" } }, { todo: { $regex: escaped, $options: "i" } }, { description: { $regex: escaped, $options: "i" } }, { bidders: { $regex: escaped, $options: "i" } }, { "bidderCompanies.name": { $regex: escaped, $options: "i" } }, { notes: { $regex: escaped, $options: "i" } }, ...(/^\d+$/.test(query) ? [{ projectNumber: Number(query) }] : [])] } : {}),
      ...(status === "__unset__" ? { projectStatus: { $in: [null, ""] } } : status ? { projectStatus: status } : {}),
    };
    const client = await getMongo();
    const projects = client.db("junyang-projects").collection("projects");
    const [total, docs, statuses] = await Promise.all([
      projects.countDocuments(filter, { maxTimeMS: 10000 }),
      projects.find(filter, { projection: { name: 1, projectNumber: 1, projectStatus: 1, bidStatus: 1, bidders: 1, projectType: 1, winner: 1, bidMethod: 1, bidStartTime: 1, projectStart: 1, projectEnd: 1, bidderCompanies: 1, notes: 1, todo: 1, updatedAt: 1, lastEditedBy: 1 } }).sort(sort).skip((page - 1) * size).limit(size).maxTimeMS(10000).toArray(),
      projects.distinct("projectStatus", {}, { maxTimeMS: 10000 }),
    ]);
    const ids = docs.map((p) => String(p._id));
    const finance = client.db("junyang-finance");
    const sums = financeDenied ? [[], []] : await Promise.all(["receipts", "invoices"].map((name) => finance.collection(name).aggregate([
      { $match: { "project.value": { $in: ids } } },
      { $group: { _id: "$project.value", count: { $sum: 1 }, amount: { $sum: "$amount" } } },
    ], { maxTimeMS: 10000 }).toArray()));
    const maps = sums.map((rows) => new Map(rows.map((row) => [row._id, { count: row.count, amount: Number(row.amount) }])));
    return NextResponse.json({ total, page, statuses: statuses.filter((value): value is string => typeof value === "string" && value.length > 0).sort(), projects: docs.map((p) => ({ id: String(p._id), name: p.name || "未命名项目", number: p.projectNumber ?? null, status: p.projectStatus || "未设置", bidStatus: p.bidStatus || "未设置", bidders: Array.isArray(p.bidders) ? p.bidders.filter((v: unknown) => typeof v === "string").join("、") : "", projectType: p.projectType || "", bidMethod: p.bidMethod || "", bidStartTime: p.bidStartTime || null, projectStart: p.projectStart || null, projectEnd: p.projectEnd || null, todo: p.todo || "", bidderCompanies: Array.isArray(p.bidderCompanies) ? p.bidderCompanies.map((c: { name?: string }) => c.name).filter(Boolean).join("、") : "", notes: p.notes || "", docFeeTotal: (p.bidderCompanies || []).reduce((total: number, company: { docFee?: number }) => total + Number(company.docFee || 0), 0), commissionTotal: (p.bidderCompanies || []).reduce((total: number, company: { commission?: number }) => total + Number(company.commission || 0), 0), depositTotal: (p.bidderCompanies || []).reduce((total: number, company: { deposit?: number }) => total + Number(company.deposit || 0), 0), winner: typeof p.winner === "string" ? p.winner : p.winner?.label || p.winner?.name || "", updatedAt: p.updatedAt || null, editor: p.lastEditedBy || "", ...(!financeDenied ? { received: maps[0].get(String(p._id)) || { count: 0, amount: 0 }, issued: maps[1].get(String(p._id)) || { count: 0, amount: 0 } } : {}) })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Project query failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "无法读取项目数据，请检查数据库连接和 SSH 隧道。" }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const { sameOrigin } = await import("@/lib/write-request");
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const denied = await requirePermission(request, ["project_add"]); if (denied) return denied;
  let body; try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
  if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 200) return NextResponse.json({ error: "请输入项目名称" }, { status: 400 });
  try {
    const { pinyin } = await import("pinyin-pro"); const { Long } = await import("mongodb");
    const name = body.name.trim(), now = new Date();
    const result = await (await getMongo()).db("junyang-projects").collection("projects").insertOne({ name, namePY: pinyin(name, { pattern: "first" }).replace(/\s/g, ""), bidders: [], bids: [], bidderCompanies: [], tags: [], callerFiles: [], bidderFiles: [], winnerNotifications: [], constructionContracts: [], jobContracts: [], completeVerifications: [], otherFiles: [], bidLimit: Long.ZERO, winnerPrice: Long.ZERO, managementFee: Long.ZERO, tax: Long.ZERO, createdAt: now, updatedAt: now });
    return NextResponse.json({ id: String(result.insertedId), name });
  } catch { return NextResponse.json({ error: "创建结果未知，请刷新列表确认" }, { status: 503 }); }
}
