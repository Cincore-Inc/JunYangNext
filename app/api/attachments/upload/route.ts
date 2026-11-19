import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { coreUrl, requireSession, requirePermission, roleManager } from "@/lib/session";
import { getMongo } from "@/lib/db";
import { documentType } from "@/lib/upload-file.mjs";
import { uploadPolicy } from "@/lib/storage";
import { deletionActor } from "@/lib/personnel-soft-delete";

export const dynamic = "force-dynamic";
const defaultMaxSize = 10 * 1024 * 1024;
const fileManagerMaxSize = 100 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const origin = new URL(request.headers.get("origin") || "");
    if (!["http:", "https:"].includes(origin.protocol) || origin.host !== request.headers.get("host")) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  } catch { return NextResponse.json({ error: "请求来源无效" }, { status: 403 }); }
  const denied = await requireSession(request);
  if (denied) return denied;
  const token = request.cookies.get("junyang_session")!.value;
  const contentLength = Number(request.headers.get("content-length"));
  if (!contentLength || contentLength > fileManagerMaxSize + 64 * 1024) return NextResponse.json({ error: "文件不能超过 100 MB" }, { status: 413 });
  try {
    const auth = { Authorization: `JWT ${token}` };
    let allowed: Record<string, boolean>;
    if (token.startsWith("v1.")) {
      allowed = {};
      for (const permission of ["project_file_upload", "project_file_view", "file_view", "finance_view", "project_bill_view"]) {
        const result = await requirePermission(request, [permission]);
        if (result && result.status !== 403) return result;
        allowed[permission] = !result;
      }
    } else {
      const permissions = await fetch(`${coreUrl}/api/account/mypermission/`, { headers: auth, cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!permissions.ok) return NextResponse.json({ error: "无法验证上传权限" }, { status: permissions.status === 401 || permissions.status === 403 ? 403 : 503 });
      allowed = await permissions.json();
    }
    if (await roleManager(request)) { allowed.project_file_upload = true; allowed.project_file_view = true; allowed.file_view = true; allowed.finance_view = true; allowed.project_bill_view = true; }
    const form = await request.formData();
    const kind = form.get("kind");
    const id = form.get("id");
    const file = form.get("file");
    const requestedField = form.get("field");
    const replace = form.get("replace") === "1";
    const transferId = form.get("transferId");
    const maxSize = fileManagerMaxSize;
    if (kind !== "transactions" && !allowed.project_file_upload) return NextResponse.json({ error: "当前账号没有上传权限" }, { status: 403 });
    if (kind === "transactions" && !allowed.finance_view) return NextResponse.json({ error: "当前账号没有财务权限" }, { status: 403 });
    if (kind === "files" && !allowed.file_view) return NextResponse.json({ error: "当前账号没有文件管理权限" }, { status: 403 });
    if (kind === "projects" && !allowed.project_file_view) return NextResponse.json({ error: "当前账号没有项目文件权限" }, { status: 403 });
    if (kind === "receipts" && !allowed.finance_view && !allowed.project_bill_view) return NextResponse.json({ error: "当前账号没有发票权限" }, { status: 403 });
    if ((kind !== "projects" && kind !== "receipts" && kind !== "files" && kind !== "transactions") || (kind !== "files" && (typeof id !== "string" || !/^[a-f\d]{24}$/i.test(id))) || !(file instanceof File) || !file.size) return NextResponse.json({ error: "附件参数无效" }, { status: 400 });
    if (file.size > maxSize) return NextResponse.json({ error: `文件不能超过 ${maxSize / 1024 / 1024} MB` }, { status: 413 });
    if (kind === "projects" && requestedField !== null && (typeof requestedField !== "string" || !["callerFiles", "bidderFiles", "winnerNotifications", "constructionContracts", "jobContracts", "completeVerifications", "otherFiles"].includes(requestedField))) return NextResponse.json({ error: "附件类型无效" }, { status: 400 });
    if (kind === "receipts" && requestedField !== null && (typeof requestedField !== "string" || !["receipts", "otherFiles", "contract", "license", "ownerId", "bankCertificate", "transferRecords"].includes(requestedField))) return NextResponse.json({ error: "附件类型无效" }, { status: 400 });
    if (replace && !((kind === "receipts" && typeof requestedField === "string" && ["contract", "license", "ownerId", "bankCertificate", "transferRecords"].includes(requestedField)) || (kind === "transactions" && requestedField === "receipt"))) return NextResponse.json({ error: "附件类型不支持更换" }, { status: 400 });
    if (requestedField === "transferRecords" && (typeof transferId !== "string" || !/^[a-f\d]{24}$/i.test(transferId))) return NextResponse.json({ error: "转账记录无效" }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = await documentType(file.size > defaultMaxSize ? bytes.subarray(0, 12) : bytes, file.name) || { extension: "bin", mime: "application/octet-stream" };
    if (!type) return NextResponse.json({ error: "文件类型或内容不受支持" }, { status: 400 });
    const collection = (await getMongo()).db(kind === "projects" ? "junyang-projects" : kind === "files" ? "junyang-files" : "junyang-finance").collection<{ receipts?: string[]; otherFiles?: string[]; transferRecords?: { _id: ObjectId; file?: string }[]; archivedAttachments?: { field: string; path: string; transferId?: string; replacedAt: Date; replacedBy: number | null }[]; receipt?: string; contract?: string; license?: string; ownerId?: string; bankCertificate?: string; status?: string; filename?: string; filepath?: string; enabled?: boolean; createdAt?: Date; updatedAt?: Date }>(kind);
    const objectId = kind === "files" ? null : new ObjectId(id as string);
    const field = kind === "projects" ? (requestedField as string || "otherFiles") : kind === "transactions" ? "receipt" : kind === "receipts" ? (requestedField as "receipts" | "otherFiles" | "contract" | "license" | "ownerId" | "bankCertificate" | "transferRecords" || "receipts") : "receipts";
    const single = ["receipt", "contract", "license", "ownerId", "bankCertificate"].includes(field);
    let previous: string | undefined;
    if (objectId) {
      const record = await collection.findOne({ _id: objectId }, { projection: { [field]: 1, status: 1, archivedAttachments: 1 }, maxTimeMS: 10000 });
      if (!record) return NextResponse.json({ error: "关联记录不存在" }, { status: 404 });
      if (field === "transferRecords") {
        const transfer = Array.isArray(record.transferRecords) && record.transferRecords.find((item) => String(item._id) === transferId);
        if (!transfer || record.status === "已对账" || (replace ? typeof transfer.file !== "string" || !transfer.file || (record.archivedAttachments !== undefined && !Array.isArray(record.archivedAttachments)) : Boolean(transfer.file))) return NextResponse.json({ error: "转账记录或凭证已变化，请刷新后重试" }, { status: 409 });
        if (replace) previous = transfer.file;
      }
      const existing = (record as Record<string, unknown>)[field];
      if (replace && field !== "transferRecords") {
        if (typeof existing !== "string" || !existing || (kind === "transactions" && record.status === "已对账") || (record.archivedAttachments !== undefined && !Array.isArray(record.archivedAttachments))) return NextResponse.json({ error: "原附件或记录状态已变化，请刷新后重试" }, { status: 409 });
        previous = existing;
      } else if (!replace && (single ? Boolean(existing) || (kind === "transactions" && record.status === "已对账") : existing !== undefined && !Array.isArray(existing))) return NextResponse.json({ error: "记录已有附件或不能上传，请刷新后重试" }, { status: 409 });
    }
    const filename = file.name.replace(/[\x00-\x1f\x7f/\\]/g, "_").slice(0, 255) || "文件";
    const key = kind === "files" ? `files/${randomUUID()}.${type.extension}` : `${kind}/${randomUUID()}/${Buffer.from(filename).toString("base64url")}.${type.extension}`;
    if (Buffer.byteLength(key, "utf8") > 1023) return NextResponse.json({ error: "文件名过长，请缩短后重试" }, { status: 400 });
    const policy = uploadPolicy(key, maxSize);
    const upload = new FormData();
    upload.set("key", key);
    upload.set("policy", policy.policy);
    upload.set("OSSAccessKeyId", policy.accessKeyId);
    upload.set("Signature", policy.signature);
    upload.set("success_action_status", "200");
    upload.set("file", new Blob([bytes], { type: type.mime }), file.name);
    const stored = await fetch(`https://${policy.bucket}.oss-cn-hangzhou.aliyuncs.com`, { method: "POST", body: upload, signal: AbortSignal.timeout(120000) });
    if (!stored.ok) throw new Error("File storage failed");
    // shortcut: a failed database update may leave an unlinked object; add storage cleanup when a restricted delete credential is available.
    if (kind === "files") {
      await collection.insertOne({ filename: file.name.slice(0, 255), filepath: key.slice("files/".length), enabled: true, createdAt: new Date(), updatedAt: new Date() }, { maxTimeMS: 10000 });
    } else if (field === "transferRecords") {
      const result = await collection.updateOne({ _id: objectId!, status: { $ne: "已对账" }, transferRecords: { $elemMatch: { _id: new ObjectId(transferId as string), ...(previous ? { file: previous } : { $or: [{ file: { $exists: false } }, { file: "" }, { file: { $type: 10 } }] }) } } }, { $set: { "transferRecords.$[item].file": key, updatedAt: new Date() }, ...(previous ? { $push: { archivedAttachments: { field, path: previous, transferId: transferId as string, replacedAt: new Date(), replacedBy: deletionActor(request) } } } : {}) }, { arrayFilters: [{ "item._id": new ObjectId(transferId as string) }], maxTimeMS: 10000 });
      if (!result.matchedCount) return NextResponse.json({ error: "文件已上传，但转账记录已变化；请联系管理员处理" }, { status: 409 });
    } else if (single) {
      const result = await collection.updateOne({ _id: objectId!, ...(previous ? { [field]: previous } : { $or: [{ [field]: { $exists: false } }, { [field]: "" }, { [field]: { $type: 10 } }] }), ...(kind === "transactions" ? { status: { $ne: "已对账" } } : {}) }, { $set: { [field]: key, updatedAt: new Date() }, ...(previous ? { $push: { archivedAttachments: { field, path: previous, replacedAt: new Date(), replacedBy: deletionActor(request) } } } : {}) }, { maxTimeMS: 10000 });
      if (!result.matchedCount) return NextResponse.json({ error: "文件已上传，但记录已有凭证或状态已变化；请联系管理员处理" }, { status: 409 });
    } else {
      const result = await collection.updateOne({ _id: objectId! }, { $push: { [field]: key }, $set: { updatedAt: new Date() } }, { maxTimeMS: 10000 });
      if (!result.matchedCount) return NextResponse.json({ error: "文件已上传，但关联记录不存在；请联系管理员处理" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Attachment upload failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "上传或关联附件失败，请稍后重试；如文件已上传，请联系管理员检查" }, { status: 503 });
  }
}
