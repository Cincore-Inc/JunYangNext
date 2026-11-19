import { NextRequest, NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getMysql } from "@/lib/mysql";
import { requirePermission } from "@/lib/session";
import { fileType } from "@/lib/upload-file.mjs";
import { sameOrigin } from "@/lib/write-request";
import { uploadObject } from "@/lib/storage";
import { randomUUID } from "node:crypto";
import { deletionActor } from "@/lib/personnel-soft-delete";

async function authorize(request: NextRequest, kind: string) {
  return requirePermission(request, kind === "itemlist" ? ["staff_item"] : ["staff_staff"]);
}
function valid(staff: string, kind: string) { return /^[1-9]\d{0,9}$/.test(staff) && ["staff", "itemlist"].includes(kind); }

export async function GET(request: NextRequest) {
  const staff = request.nextUrl.searchParams.get("staff") || "", kind = request.nextUrl.searchParams.get("kind") || "";
  if (!valid(staff, kind)) return NextResponse.json({ error: "参数无效" }, { status: 400 });
  const denied = await authorize(request, kind); if (denied) return denied;
  try {
    const pool = getMysql();
    const [images] = await pool.execute<RowDataPacket[]>("SELECT id FROM staff_imagelist i WHERE staff_id = ? AND image_type = ? AND NOT EXISTS (SELECT 1 FROM junyang_deleted_personnel d WHERE d.kind = 'images' AND d.record_id = i.id) ORDER BY id", [staff, kind]);
    const [item] = kind === "itemlist" ? await pool.execute<RowDataPacket[]>("SELECT itemmessage FROM staff_itemlist WHERE staff_id = ?", [staff]) : [[]];
    return NextResponse.json({ images: images.map((row) => ({ id: row.id })), item: item[0]?.itemmessage ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "无法读取人员资料" }, { status: 503 }); }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const denied = await authorize(request, "itemlist"); if (denied) return denied;
  let body; try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
  if (!Number.isSafeInteger(body.staff) || body.staff < 1 || typeof body.item !== "string" || body.item.length > 300 || (body.expected !== null && (typeof body.expected !== "string" || body.expected.length > 300))) return NextResponse.json({ error: "物品清单无效" }, { status: 400 });
  try {
    const connection = await getMysql().getConnection();
    try {
      await connection.beginTransaction();
      const [staff] = await connection.execute<RowDataPacket[]>("SELECT id FROM staff_staff WHERE id = ? FOR UPDATE", [body.staff]);
      if (!staff.length) { await connection.rollback(); return NextResponse.json({ error: "人员不存在" }, { status: 404 }); }
      const [items] = await connection.execute<RowDataPacket[]>("SELECT id, itemmessage FROM staff_itemlist WHERE staff_id = ? FOR UPDATE", [body.staff]);
      if ((items[0]?.itemmessage ?? null) !== body.expected) { await connection.rollback(); return NextResponse.json({ error: "物品清单已变化，请刷新后重试" }, { status: 409 }); }
      if (items.length) await connection.execute<ResultSetHeader>("UPDATE staff_itemlist SET itemmessage = ? WHERE id = ?", [body.item, items[0].id]);
      else await connection.execute("INSERT INTO staff_itemlist (staff_id, itemmessage) VALUES (?, ?)", [body.staff, body.item]);
      await connection.commit(); return NextResponse.json({ ok: true });
    } catch { await connection.rollback(); throw new Error("Save failed"); } finally { connection.release(); }
  } catch { return NextResponse.json({ error: "保存结果未知，请刷新后确认" }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const length = Number(request.headers.get("content-length"));
  if (!length || length > 10 * 1024 * 1024 + 65536) return NextResponse.json({ error: "图片不能超过 10 MB" }, { status: 413 });
  try {
    const form = await request.formData(), staff = form.get("staff"), kind = form.get("kind"), file = form.get("file");
    if (typeof staff !== "string" || typeof kind !== "string" || !valid(staff, kind) || !(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "上传参数无效" }, { status: 400 });
    const denied = await authorize(request, kind); if (denied) return denied;
    const bytes = new Uint8Array(await file.arrayBuffer()), type = fileType(bytes);
    if (!type || !["image/jpeg", "image/png"].includes(type.mime)) return NextResponse.json({ error: "仅支持 JPG 和 PNG 图片" }, { status: 400 });
    const db = getMysql();
    const [rows] = await db.execute<RowDataPacket[]>("SELECT id FROM staff_staff WHERE id = ?", [staff]);
    if (!rows.length) return NextResponse.json({ error: "人员不存在" }, { status: 404 });
    const path = `staff/image/${randomUUID()}.${type.extension}`;
    await uploadObject(`core-media/${path}`, bytes, type.mime, 10 * 1024 * 1024);
    await db.execute("INSERT INTO staff_imagelist (staff_id, image_type, image) VALUES (?, ?, ?)", [staff, kind, `oss:${path}`]);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "上传结果未知，请刷新后确认" }, { status: 503 }); }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const p = request.nextUrl.searchParams, staff = p.get("staff") || "", kind = p.get("kind") || "", id = p.get("id") || "";
  if (!valid(staff, kind) || !/^[1-9]\d{0,9}$/.test(id)) return NextResponse.json({ error: "参数无效" }, { status: 400 });
  const denied = await authorize(request, kind); if (denied) return denied;
  try {
    const connection = await getMysql().getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<RowDataPacket[]>("SELECT id FROM staff_imagelist WHERE id = ? AND staff_id = ? AND image_type = ? FOR UPDATE", [id, staff, kind]);
      if (!rows.length) { await connection.rollback(); return NextResponse.json({ error: "图片不存在" }, { status: 404 }); }
      const [deleted] = await connection.execute<RowDataPacket[]>("SELECT record_id FROM junyang_deleted_personnel WHERE kind = 'images' AND record_id = ?", [id]);
      if (deleted.length) { await connection.rollback(); return NextResponse.json({ error: "图片已删除" }, { status: 409 }); }
      await connection.execute("INSERT INTO junyang_deleted_personnel (kind, record_id, deleted_at, deleted_by) VALUES ('images', ?, UTC_TIMESTAMP(6), ?)", [id, deletionActor(request)]);
      await connection.commit(); return NextResponse.json({ ok: true });
    } catch { await connection.rollback(); throw new Error("Delete failed"); } finally { connection.release(); }
  } catch { return NextResponse.json({ error: "删除结果未知，请刷新后确认" }, { status: 503 }); }
}
