import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { getMongo } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { sameOrigin } from "@/lib/write-request";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const denied = await requirePermission(request, ["project_file_delete"]); if (denied) return denied;
  const { id } = await params;
  if (!/^[a-f\d]{24}$/i.test(id)) return NextResponse.json({ error: "项目编号无效" }, { status: 400 });
  let body; try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
  const fields = ["callerFiles", "bidderFiles", "winnerNotifications", "constructionContracts", "jobContracts", "completeVerifications", "otherFiles"];
  const version = typeof body.updatedAt === "string" ? new Date(body.updatedAt) : null;
  if (!fields.includes(body.field) || !Number.isInteger(body.index) || body.index < 0 || body.index > 1000 || !version || Number.isNaN(version.getTime())) return NextResponse.json({ error: "附件参数无效" }, { status: 400 });
  try {
    const collection = (await getMongo()).db("junyang-projects").collection("projects");
    const row = await collection.findOne({ _id: new ObjectId(id), updatedAt: version, deletedAt: null }, { projection: { [body.field]: 1, deletedAttachments: 1 } });
    const files = row?.[body.field];
    if (!Array.isArray(files) || typeof files[body.index] !== "string") return NextResponse.json({ error: "附件已变化或不存在，请刷新后重试" }, { status: 409 });
    if (row?.deletedAttachments !== undefined && !Array.isArray(row.deletedAttachments)) return NextResponse.json({ error: "删除记录格式异常" }, { status: 409 });
    const remaining = files.filter((_, index) => index !== body.index);
    const result = await collection.updateOne({ _id: new ObjectId(id), updatedAt: version, deletedAt: null }, { $set: { [body.field]: remaining, deletedAttachments: [...(row?.deletedAttachments || []), { field: body.field, path: files[body.index], deletedAt: new Date() }], updatedAt: new Date() } });
    return result.matchedCount ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "项目已变化，请刷新后重试" }, { status: 409 });
  } catch { return NextResponse.json({ error: "删除结果未知，请刷新后确认" }, { status: 503 }); }
}
