import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { readPersonnelMedia } from "@/lib/personnel-media";
import { uploadObject } from "@/lib/storage";
import { randomUUID } from "node:crypto";
import { fileType } from "@/lib/upload-file.mjs";
import { getMysql } from "@/lib/mysql";
import { sameOrigin } from "@/lib/write-request";
import type { RowDataPacket } from "mysql2";

const maxSize = 10 * 1024 * 1024;
const fields = ["company_payproof", "persenal_payproof"];

export async function GET(request: NextRequest) {
  const denied = await requirePermission(request, ["insurancedetail_view", "staff_insurancedetail"], "any");
  if (denied) return denied;
  const id = request.nextUrl.searchParams.get("id") || "", field = request.nextUrl.searchParams.get("field") || "";
  if (!/^[1-9]\d{0,9}$/.test(id) || !fields.includes(field)) return NextResponse.json({ error: "参数无效" }, { status: 400 });
  try {
    const [rows] = await getMysql().execute<RowDataPacket[]>(`SELECT ${field} AS path FROM staff_insurancedetail WHERE id = ?`, [id]);
    const path = rows[0]?.path;
    if (typeof path !== "string" || !/^(?:oss:)?(?:staff|company)\/image\/[\w.-]+$/.test(path)) return NextResponse.json({ error: "凭证不存在" }, { status: 404 });
    const { response, mime } = await readPersonnelMedia(path);
    const headers = new Headers({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Type": mime, "Content-Security-Policy": "default-src 'none'; sandbox" });
    if (request.nextUrl.searchParams.get("download") === "1") headers.set("Content-Disposition", `attachment; filename="${path.split("/").pop()}"`);
    return new NextResponse(response.body, { headers });
  } catch { return NextResponse.json({ error: "凭证读取失败" }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const length = Number(request.headers.get("content-length"));
  if (!length || length > maxSize + 65536) return NextResponse.json({ error: "文件不能超过 10 MB" }, { status: 413 });
  try {
    const form = await request.formData();
    const id = form.get("id"), field = form.get("field"), file = form.get("file");
    if (typeof id !== "string" || !/^[1-9]\d{0,9}$/.test(id) || typeof field !== "string" || !fields.includes(field) || !(file instanceof File) || !file.size || file.size > maxSize) return NextResponse.json({ error: "上传参数无效" }, { status: 400 });
    const denied = await requirePermission(request, ["insurancedetail_view", field === "company_payproof" ? "insurancedetail_company_payproof" : "insurancedetail_persenal_payproof"]);
    if (denied) return denied;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = fileType(bytes);
    if (!type || !["image/jpeg", "image/png"].includes(type.mime)) return NextResponse.json({ error: "仅支持 JPG 和 PNG 图片" }, { status: 400 });
    const db = getMysql();
    const [rows] = await db.execute<RowDataPacket[]>(`SELECT ${field} AS path FROM staff_insurancedetail WHERE id = ?`, [id]);
    if (!rows.length) return NextResponse.json({ error: "社保记录不存在" }, { status: 404 });
    const path = `staff/image/${randomUUID()}.${type.extension}`;
    await uploadObject(`core-media/${path}`, bytes, type.mime, maxSize);
    const dateField = field === "company_payproof" ? "company_pay_date" : "persenal_pay_date";
    const [result] = await db.execute<import("mysql2").ResultSetHeader>(`UPDATE staff_insurancedetail SET ${field} = ?, ${dateField} = CURRENT_DATE()${field === "company_payproof" ? ", insure_status = 'ON'" : ""} WHERE id = ? AND ${field} <=> ?`, [`oss:${path}`, id, rows[0].path ?? null]);
    if (!result.affectedRows) return NextResponse.json({ error: "记录已变化，文件未关联，请刷新后重试" }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "上传结果未知，请刷新后确认" }, { status: 503 }); }
}
