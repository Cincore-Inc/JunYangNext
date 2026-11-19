import { getMongo } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { sameOrigin } from "@/lib/write-request";
import { deletionActor } from "@/lib/personnel-soft-delete";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requirePermission(request, ["file_view"]);
  if (denied) return denied;
  try {
    const params = request.nextUrl.searchParams;
    const q = (params.get("q") || "").trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const page = Math.max(1, Math.min(10000, parseInt(params.get("page") || "1", 10) || 1));
    const limit = Number(params.get("limit") || 25);
    const sort = params.get("sort") || "createdAt", order = params.get("order") || "desc";
    if (![25, 50, 100, 200, 300, 400].includes(limit) || !["createdAt", "effectiveFrom", "expiresAt"].includes(sort) || !["asc", "desc"].includes(order)) return NextResponse.json({ error: "分页或排序参数无效" }, { status: 400 });
    const type = (params.get("type") || "").slice(0, 100), subtype = (params.get("subtype") || "").slice(0, 100), status = (params.get("status") || "").slice(0, 100), renew = params.get("needRenew") || "", owner = params.get("owner") || "";
    const associates = params.getAll("associate"), tags = params.getAll("tag");
    const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
    if ((renew && !["true", "false", "__unset__"].includes(renew)) || (owner && owner !== "__unset__" && !uuid.test(owner)) || associates.length > 30 || associates.some(value => !uuid.test(value)) || tags.length > 30 || tags.some(value => !value || value.length > 100)) return NextResponse.json({ error: "文件筛选条件无效" }, { status: 400 });
    const selection = (value: string) => value === "__unset__" ? { $in: [null, ""] } : value;
    const filter = { enabled: { $ne: false }, ...(q ? { filename: { $regex: q, $options: "i" } } : {}), ...(type ? { type: selection(type) } : {}), ...(subtype ? { subtype: selection(subtype) } : {}), ...(status ? { status: selection(status) } : {}), ...(renew ? { needRenew: renew === "__unset__" ? null : renew === "true" } : {}), ...(owner ? { owner: selection(owner) } : {}), ...(associates.length ? { associates: { $all: associates } } : {}), ...(tags.length ? { tags: { $all: tags } } : {}) };
    const collection = (await getMongo()).db("junyang-files").collection("files");
    const [total, docs] = await Promise.all([collection.countDocuments(filter, { maxTimeMS: 10000 }), collection.find(filter, { projection: { filename: 1, type: 1, subtype: 1, tags: 1, status: 1, owner: 1, associates: 1, needRenew: 1, note: 1, effectiveFrom: 1, expiresAt: 1, createdAt: 1, updatedAt: 1, filepath: 1 } }).sort({ [sort]: order === "asc" ? 1 : -1, _id: -1 }).skip((page - 1) * limit).limit(limit).maxTimeMS(10000).toArray()]);
    return NextResponse.json({ total, items: docs.map((row) => ({ id: String(row._id), filename: row.filename || "未命名文件", type: row.type || "", subtype: row.subtype || "", tags: Array.isArray(row.tags) ? row.tags : [], owner: row.owner || "", associates: Array.isArray(row.associates) ? row.associates : [], needRenew: row.needRenew ?? null, note: row.note || "", effectiveFrom: row.effectiveFrom || null, expiresAt: row.expiresAt || null, status: row.status || "", createdAt: row.createdAt || null, updatedAt: row.updatedAt || null, files: row.filepath ? [{ field: "filepath", index: 0, extension: String(row.filepath).split(".").pop()?.toLowerCase() || "", label: "预览" }] : [] })) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "无法读取文件列表，请检查连接" }, { status: 503 });
  }
}

const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
async function write(request: NextRequest, remove: boolean) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const denied = await requirePermission(request, ["file_view", remove ? "project_file_delete" : "project_file_upload"]);
  if (denied) return denied;
  let body: { id?: string; updatedAt?: string | null; changes?: Record<string, unknown> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求无效" }, { status: 400 }); }
  if (!body || typeof body.id !== "string" || !/^[a-f\d]{24}$/i.test(body.id) || !(body.updatedAt === null || (typeof body.updatedAt === "string" && !Number.isNaN(Date.parse(body.updatedAt))))) return NextResponse.json({ error: "文件参数无效" }, { status: 400 });
  const changes: Record<string, unknown> = {};
  if (!remove) {
    if (!body.changes || typeof body.changes !== "object" || Array.isArray(body.changes) || !Object.keys(body.changes).length) return NextResponse.json({ error: "没有需要保存的修改" }, { status: 400 });
    for (const [key, value] of Object.entries(body.changes)) {
      if (["filename", "type", "subtype", "status", "note"].includes(key)) {
        if (typeof value !== "string" || value.length > (key === "note" ? 2000 : 255) || (key === "filename" && !value.trim())) return NextResponse.json({ error: "文件信息无效" }, { status: 400 });
        changes[key] = value;
      } else if (key === "owner") {
        if (typeof value !== "string" || (value && !uuid.test(value))) return NextResponse.json({ error: "文件归属无效" }, { status: 400 });
        changes[key] = value;
      } else if (key === "associates" || key === "tags") {
        if (!Array.isArray(value) || value.length > 30 || value.some(v => typeof v !== "string" || !v || v.length > 100 || (key === "associates" && !uuid.test(v)))) return NextResponse.json({ error: "文件关联或标签无效" }, { status: 400 });
        changes[key] = value;
      } else if (key === "needRenew") {
        if (value !== null && typeof value !== "boolean") return NextResponse.json({ error: "年审状态无效" }, { status: 400 });
        changes[key] = value;
      } else if (key === "effectiveFrom" || key === "expiresAt") {
        if (value === null || value === "") { changes[key] = null; continue; }
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NextResponse.json({ error: "日期无效" }, { status: 400 });
        const parsed = new Date(`${value}T00:00:00+08:00`);
        if (Number.isNaN(parsed.getTime()) || new Date(parsed.getTime() + 8 * 3600000).toISOString().slice(0, 10) !== value) return NextResponse.json({ error: "日期无效" }, { status: 400 });
        changes[key] = parsed;
      } else return NextResponse.json({ error: "文件字段无效" }, { status: 400 });
    }
  }
  try {
    const updatedAt = body.updatedAt ? new Date(body.updatedAt) : null;
    const now = new Date(Math.max(Date.now(), (updatedAt?.getTime() ?? 0) + 1));
    const result = await (await getMongo()).db("junyang-files").collection("files").updateOne({ _id: new ObjectId(body.id), enabled: { $ne: false }, updatedAt }, { $set: remove ? { enabled: false, deletedAt: now, deletedBy: deletionActor(request), updatedAt: now } : { ...changes, updatedAt: now } });
    return result.matchedCount ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "文件已变更或删除，请刷新后重试" }, { status: 409 });
  } catch { return NextResponse.json({ error: "操作结果未知，请刷新后确认" }, { status: 503 }); }
}
export async function PATCH(request: NextRequest) { return write(request, false); }
export async function DELETE(request: NextRequest) { return write(request, true); }
