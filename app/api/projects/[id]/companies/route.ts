import { Long, ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { getMongo } from "@/lib/db";
import { parseMoney } from "@/lib/money.mjs";
import { requirePermission } from "@/lib/session";
import { sameOrigin } from "@/lib/write-request";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const denied = await requirePermission(request, ["project_detail"]); if (denied) return denied;
  const { id } = await params;
  if (!/^[a-f\d]{24}$/i.test(id)) return NextResponse.json({ error: "项目编号无效" }, { status: 400 });
  let body; try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
  const version = typeof body.updatedAt === "string" ? new Date(body.updatedAt) : null;
  const index = body.index;
  const textFields = ["name", "staff", "showPerson", "note"];
  const moneyFields = ["docFee", "commission", "applicationFee", "deposit", "creditReportFee", "letterFee", "showFee", "otherFee"];
  if (!version || Number.isNaN(version.getTime()) || (index !== null && (!Number.isInteger(index) || index < 0 || index > 999)) || textFields.some((key) => typeof body[key] !== "string" || body[key].length > (key === "note" ? 500 : 200)) || (index === null && !body.name.trim())) return NextResponse.json({ error: "投标公司信息无效" }, { status: 400 });
  const amounts = moneyFields.map((field) => typeof body[field] === "string" ? parseMoney(body[field]) : null);
  if (amounts.some((value) => value === null || value < 0)) return NextResponse.json({ error: "请输入正确的费用金额" }, { status: 400 });
  const date = body.depositRefundDate ? new Date(`${body.depositRefundDate}T00:00:00+08:00`) : null;
  if (typeof body.depositRefundDate !== "string" || (date && (!/^\d{4}-\d{2}-\d{2}$/.test(body.depositRefundDate) || Number.isNaN(date.getTime()) || new Date(date.getTime() + 28800000).toISOString().slice(0,10) !== body.depositRefundDate))) return NextResponse.json({ error: "退还日期无效" }, { status: 400 });
  try {
    const collection = (await getMongo()).db("junyang-projects").collection("projects");
    const project = await collection.findOne({ _id: new ObjectId(id), updatedAt: version }, { projection: { bidderCompanies: 1 } });
    if (!project || (project.bidderCompanies != null && !Array.isArray(project.bidderCompanies)) || (index !== null && !project.bidderCompanies?.[index]) || (index === null && (project.bidderCompanies?.length || 0) >= 1000)) return NextResponse.json({ error: "项目已变化或投标公司不存在，请刷新后重试" }, { status: 409 });
    const companies = [...(project.bidderCompanies || [])];
    const original = index === null ? null : companies[index];
    const entry = { ...(original || { _id: new ObjectId() }) };
    for (const key of textFields) {
      const value = body[key].trim();
      if (!original || value !== (typeof original[key] === "string" ? original[key].trim() : "")) entry[key] = value;
    }
    for (const [i, key] of moneyFields.entries()) {
      const existing = original?.[key] == null ? 0 : Number(original[key]);
      if (!original || !Number.isSafeInteger(existing) || existing !== amounts[i]) entry[key] = Long.fromNumber(amounts[i]!);
    }
    const oldDate = original?.depositRefundDate instanceof Date ? new Date(original.depositRefundDate.getTime() + 28800000).toISOString().slice(0, 10) : "";
    if (!original || oldDate !== body.depositRefundDate) entry.depositRefundDate = date;
    if (index === null) companies.push(entry); else companies[index] = entry;
    const result = await collection.updateOne({ _id: new ObjectId(id), updatedAt: version }, { $set: { bidderCompanies: companies, updatedAt: new Date(Math.max(Date.now(), version.getTime() + 1)) } });
    return result.matchedCount ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "项目已变化，请刷新后重试" }, { status: 409 });
  } catch { return NextResponse.json({ error: "保存结果未知，请刷新后确认" }, { status: 503 }); }
}
