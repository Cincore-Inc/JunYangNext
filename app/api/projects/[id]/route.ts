import { requirePermission } from "@/lib/session";
import { attachmentRefs } from "@/lib/attachments";
import { getMongo } from "@/lib/db";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { projectTexts, projectUpdate } from "@/lib/project-fields";
import { pinyin } from "pinyin-pro";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requirePermission(request, ["project_detail"]);
  if (denied) return denied;
  const billDenied = await requirePermission(request, ["project_bill_view"]);
  const fileDenied = await requirePermission(request, ["project_file_view"]);
  if (billDenied && billDenied.status !== 403) return billDenied;
  if (fileDenied && fileDenied.status !== 403) return fileDenied;
  const { id } = await params;
  if (!ObjectId.isValid(id) || !/^[a-f\d]{24}$/i.test(id)) return NextResponse.json({ error: "项目编号无效" }, { status: 400 });
  try {
    const client = await getMongo();
    const project = await client.db("junyang-projects").collection("projects").findOne({ _id: new ObjectId(id) }, { projection: { name: 1, projectNumber: 1, projectStatus: 1, address: 1, caller: 1, createdAt: 1, updatedAt: 1, otherFiles: 1, callerFiles: 1, bidderFiles: 1, winnerNotifications: 1, constructionContracts: 1, jobContracts: 1, completeVerifications: 1, fileNote: 1, lastEditedBy: 1, callerContact: 1, callerPhone: 1, callerBank: 1, callerBankAccount: 1, winnerOther: 1, managementFee: 1, tax: 1, taxDeductRatio: 1, materialRatio: 1, laborRatio: 1, projectStart: 1, projectEnd: 1, todo: 1, bidders: 1, phone: 1, bidMethod: 1, bidStatus: 1, bidAddress: 1, bidStartTime: 1, bidLimit: 1, requireOriginalFiles: 1, bids: 1, bidderCompanies: 1, winner: 1, winnerPrice: 1, projectType: 1, description: 1, notes: 1, tags: 1 } });
    if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    const finance = client.db("junyang-finance");
    const query = new URL(request.url).searchParams;
    const page = (key: string) => Math.max(1, Math.min(10000, Number.parseInt(query.get(key) || "1", 10) || 1));
    const [receipts, invoices] = billDenied ? [[], []] : await Promise.all(["receipts", "invoices"].map((name) => finance.collection(name).find({ "project.value": id }, { projection: { amount: 1, date: 1, receiptId: 1, invoiceId: 1, issuer: 1, buyer: 1, ticketStatus: 1, status: 1, company: 1, receipts: 1, otherFiles: 1, contract: 1, license: 1, ownerId: 1, bankCertificate: 1 } }).sort({ date: -1, _id: -1 }).skip((page(name) - 1) * 10).limit(10).maxTimeMS(10000).toArray()));
    const format = (docs: typeof receipts) => docs.map((d) => ({ id: String(d._id), number: d.receiptId || d.invoiceId || "", date: d.date || null, company: d.company?.name || d.company?.label || "", party: d.issuer || d.buyer || "", amount: Number(d.amount || 0), ticketStatus: d.ticketStatus || "未设置", status: d.status || "未设置", files: attachmentRefs(d, ["receipts", "otherFiles", "contract", "license", "ownerId", "bankCertificate"]) }));
    return NextResponse.json({ project: { id, name: project.name, number: project.projectNumber ?? null, status: project.projectStatus || "未设置", address: project.address || "", caller: project.caller || "", createdAt: project.createdAt || null, updatedAt: project.updatedAt || null, lastEditedBy: project.lastEditedBy || "", callerContact: project.callerContact || "", callerPhone: project.callerPhone || "", callerBank: project.callerBank || "", callerBankAccount: project.callerBankAccount || "", winnerOther: project.winnerOther || "", managementFee: project.managementFee ?? null, tax: project.tax ?? null, taxDeductRatio: project.taxDeductRatio || "", materialRatio: project.materialRatio || "", laborRatio: project.laborRatio || "", projectStart: project.projectStart || null, projectEnd: project.projectEnd || null, todo: project.todo || "", fileNote: project.fileNote || "", bidders: project.bidders || [], phone: project.phone || "", bidMethod: project.bidMethod || "", bidStatus: project.bidStatus || "", bidAddress: project.bidAddress || "", bidStartTime: project.bidStartTime || null, bidLimit: project.bidLimit ?? null, requireOriginalFiles: project.requireOriginalFiles ?? null, bids: project.bids || [], bidderCompanies: project.bidderCompanies || [], winner: project.winner || null, winnerPrice: project.winnerPrice ?? null, projectType: project.projectType || "", description: project.description || "", notes: project.notes || "", tags: project.tags || [], files: fileDenied ? [] : attachmentRefs(project, ["callerFiles", "bidderFiles", "winnerNotifications", "constructionContracts", "jobContracts", "completeVerifications", "otherFiles"]) }, permissions: { bills: !billDenied, files: !fileDenied }, receipts: format(receipts), invoices: format(invoices) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Project detail failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "无法读取项目明细，请检查数据库连接和 SSH 隧道。" }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { sameOrigin } = await import("@/lib/write-request");
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const denied = await requirePermission(request, ["project_detail"]); if (denied) return denied;
  const { id } = await params;
  if (!/^[a-f\d]{24}$/i.test(id)) return NextResponse.json({ error: "项目编号无效" }, { status: 400 });
  let body; try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
  const updatedAt = typeof body.updatedAt === "string" ? new Date(body.updatedAt) : null;
  if (!updatedAt || Number.isNaN(updatedAt.getTime())) return NextResponse.json({ error: "请刷新项目后重试" }, { status: 400 });
  let values: Record<string, unknown>;
  try { values = projectUpdate(body); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "项目字段无效" }, { status: 400 }); }
  try {
    const client = await getMongo(); const projects = client.db("junyang-projects").collection("projects");
    const current = await projects.findOne({ _id: new ObjectId(id), updatedAt }, { projection: Object.fromEntries(["name", ...Object.keys(values)].map((key) => [key, 1])) });
    if (!current) return NextResponse.json({ error: "项目已变化或不存在，请刷新后重试" }, { status: 409 });
    for (const key of projectTexts) {
      if (body[key] === current[key]) values[key] = current[key];
    }
    const name = values.name as string;
    for (const [key, value] of Object.entries(values)) {
      if (current[key] == null && (value === "" || value === null || (Array.isArray(value) && value.length === 0))) delete values[key];
    }
    if (name !== current.name) {
      values.namePY = pinyin(name, { pattern: "first" }).replace(/\s/g, "");
      const session = client.startSession();
      try { await session.withTransaction(async () => {
        const updated = await projects.updateOne({ _id: new ObjectId(id), updatedAt }, { $set: { ...values, updatedAt: new Date() } }, { session });
        if (!updated.matchedCount) throw new Error("conflict");
        for (const kind of ["transactions", "receipts", "invoices"]) await client.db("junyang-finance").collection(kind).updateMany({ "project.value": id }, { $set: { "project.label": name } }, { session });
      }); } finally { await session.endSession(); }
    } else {
      const result = await projects.updateOne({ _id: new ObjectId(id), updatedAt }, { $set: { ...values, updatedAt: new Date() } }, { maxTimeMS: 10000 });
      if (!result.matchedCount) return NextResponse.json({ error: "项目已变化或不存在，请刷新后重试" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "conflict") return NextResponse.json({ error: "项目已变化，请刷新后重试" }, { status: 409 });
    return NextResponse.json({ error: "保存失败，请刷新后重试；项目名称和财务关联不会部分更新" }, { status: 503 });
  }
}
