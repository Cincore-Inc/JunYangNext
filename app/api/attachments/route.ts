import { requirePermission } from "@/lib/session";
import { getMongo } from "@/lib/db";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { signedFileUrl } from "@/lib/storage";
import { attachmentFilename } from "@/lib/attachments";

export const dynamic = "force-dynamic";
const fields: Record<string, string[]> = { receipts: ["receipts", "otherFiles", "contract", "license", "ownerId", "bankCertificate", "transferRecords"], transactions: ["receipt"], projects: ["callerFiles", "bidderFiles", "winnerNotifications", "constructionContracts", "jobContracts", "completeVerifications", "otherFiles"], files: ["filepath"] };

export async function GET(request: NextRequest) {
  if (!request.cookies.get("junyang_session")?.value) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const params = request.nextUrl.searchParams;
  const kind = params.get("kind") || "";
  const field = params.get("field") || "";
  const id = params.get("id") || "";
  const index = Number(params.get("index") || 0);
  const transferId = params.get("transferId") || "";
  const denied = await requirePermission(request, kind === "files" ? ["file_view"] : kind === "projects" ? ["project_file_view"] : kind === "transactions" ? ["finance_view"] : fields[kind] ? ["finance_view", "project_bill_view"] : [], kind === "receipts" ? "any" : "all");
  if (denied) return denied;
  if (!fields[kind]?.includes(field) || !/^[a-f\d]{24}$/i.test(id) || !Number.isInteger(index) || index < 0 || index > 1000) return NextResponse.json({ error: "附件参数无效" }, { status: 400 });
  if (field === "transferRecords" && !/^[a-f\d]{24}$/i.test(transferId)) return NextResponse.json({ error: "附件参数无效" }, { status: 400 });
  try {
    const client = await getMongo();
    const row = await client.db(kind === "projects" ? "junyang-projects" : kind === "files" ? "junyang-files" : "junyang-finance").collection(kind).findOne({ _id: new ObjectId(id), ...(kind === "files" ? { enabled: { $ne: false } } : {}) }, { projection: { [field]: 1, ...(kind === "files" ? { filename: 1 } : {}) } });
    const value = row?.[field];
    let path = field === "transferRecords" && Array.isArray(value) ? value.find((item) => String(item._id) === transferId)?.file : Array.isArray(value) ? value[index] : index === 0 ? value : null;
    if (kind === "files" && typeof path === "string" && !path.startsWith("files/")) path = `files/${path}`;
    if (typeof path !== "string" || !path || path.length > 1024) return NextResponse.json({ error: "附件不存在" }, { status: 404 });
    const action = params.get("download") === "1" ? "download" : "preview";
    const filename = kind === "files" && typeof row?.filename === "string" ? row.filename : attachmentFilename(path);
    const url = new URL(signedFileUrl(path, action === "download", filename));
    if (!["http:", "https:"].includes(url.protocol) || url.hostname !== "junyang-files-hangzhou.oss-cn-hangzhou.aliyuncs.com") throw new Error("Invalid file URL");
    url.protocol = "https:";
    if (action === "preview") {
      const ext = path.split(".").pop()?.toLowerCase();
      const mime: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", pdf: "application/pdf" };
      if (ext && mime[ext]) {
        const file = await fetch(url, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(30000) });
        if (!file.ok || !file.body) throw new Error("Preview failed");
        return new NextResponse(file.body, { headers: { "Content-Type": mime[ext], "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
      }
    }
    const result = NextResponse.redirect(url);
    result.headers.set("Cache-Control", "no-store");
    result.headers.set("Referrer-Policy", "no-referrer");
    return result;
  } catch {
    return NextResponse.json({ error: "附件暂时无法打开，请检查文件服务和 SSH 隧道" }, { status: 503 });
  }
}
