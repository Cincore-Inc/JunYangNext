import JSZip from "jszip";
import type { RowDataPacket } from "mysql2";
import { NextRequest, NextResponse } from "next/server";
import { getMysql } from "@/lib/mysql";
import { requirePermission } from "@/lib/session";
import { readPersonnelMedia } from "@/lib/personnel-media";
import { sameOrigin } from "@/lib/write-request";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const denied = await requirePermission(request, ["insurancedetail_view", "insurancedetail_download"]);
  if (denied) return denied;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
  if (!Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 100 || !body.ids.every((id: unknown) => Number.isSafeInteger(id) && Number(id) > 0)) return NextResponse.json({ error: "请选择 1–100 条社保记录" }, { status: 400 });
  const ids = [...new Set<number>(body.ids)];
  try {
    const [rows] = await getMysql().execute<RowDataPacket[]>(`SELECT id, company_payproof, persenal_payproof FROM staff_insurancedetail WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
    if (rows.length !== ids.length) return NextResponse.json({ error: "部分社保记录不存在，请刷新后重试" }, { status: 409 });
    const zip = new JSZip(); let total = 0, count = 0;
    for (const row of rows) for (const [field, label] of [["company_payproof", "company"], ["persenal_payproof", "personal"]]) {
      const path = row[field]; if (!path) continue;
      const { response, mime } = await readPersonnelMedia(path);
      const bytes = await response.arrayBuffer(); total += bytes.byteLength;
      if (total > 100 * 1024 * 1024) return NextResponse.json({ error: "文件总大小超过 100 MB，请分批下载" }, { status: 413 });
      zip.file(`${row.id}-${label}.${mime === "image/png" ? "png" : "jpg"}`, bytes); count++;
    }
    if (!count) return NextResponse.json({ error: "所选记录没有凭证" }, { status: 404 });
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    return new NextResponse(new Uint8Array(bytes).buffer, { headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="insurance-proofs.zip"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ error: "凭证下载失败，请检查文件服务后重试" }, { status: 503 }); }
}
