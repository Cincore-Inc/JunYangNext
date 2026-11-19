import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getMysql } from "@/lib/mysql";
import { requirePermission } from "@/lib/session";
import { personnelFilename, readPersonnelMedia } from "@/lib/personnel-media";

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams, staff = p.get("staff") || "", id = p.get("id") || "", kind = p.get("kind") || "";
  if (!/^[1-9]\d{0,9}$/.test(staff) || !/^[1-9]\d{0,9}$/.test(id) || !["staff", "itemlist"].includes(kind)) return NextResponse.json({ error: "参数无效" }, { status: 400 });
  const denied = await requirePermission(request, kind === "itemlist" ? ["staff_item"] : ["staff_staff"]); if (denied) return denied;
  try {
    const [rows] = await getMysql().execute<RowDataPacket[]>("SELECT image FROM staff_imagelist i WHERE id = ? AND staff_id = ? AND image_type = ? AND NOT EXISTS (SELECT 1 FROM junyang_deleted_personnel d WHERE d.kind = 'images' AND d.record_id = i.id)", [id, staff, kind]);
    const path = rows[0]?.image;
    if (typeof path !== "string" || !/^(?:oss:)?staff\/image\/[\w.-]+$/.test(path)) return NextResponse.json({ error: "图片不存在" }, { status: 404 });
    const { response, mime } = await readPersonnelMedia(path);
    const headers = new Headers({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Type": mime, "Content-Security-Policy": "default-src 'none'; sandbox" });
    if (p.get("download") === "1") headers.set("Content-Disposition", `attachment; filename="${personnelFilename(path, mime)}"`);
    return new NextResponse(response.body, { headers });
  } catch { return NextResponse.json({ error: "图片读取失败" }, { status: 503 }); }
}
