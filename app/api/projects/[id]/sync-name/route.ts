import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { getMongo } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { sameOrigin } from "@/lib/write-request";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const denied = await requirePermission(request, ["project_all_view"]); if (denied) return denied;
  const { id } = await params;
  if (!/^[a-f\d]{24}$/i.test(id)) return NextResponse.json({ error: "项目编号无效" }, { status: 400 });
  try {
    const client = await getMongo(); const projects = client.db("junyang-projects").collection("projects"); const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const project = await projects.findOne({ _id: new ObjectId(id) }, { projection: { name: 1 }, session });
        if (!project || typeof project.name !== "string" || !project.name.trim()) throw new Error("not_found");
        await projects.updateOne({ _id: new ObjectId(id), name: project.name }, { $set: { updatedAt: new Date() } }, { session });
        for (const kind of ["transactions", "receipts", "invoices"]) await client.db("junyang-finance").collection(kind).updateMany({ "project.value": id }, { $set: { "project.label": project.name } }, { session });
      });
    } finally { await session.endSession(); }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "not_found") return NextResponse.json({ error: "项目不存在或名称为空" }, { status: 404 });
    return NextResponse.json({ error: "同步失败，请稍后重试" }, { status: 503 });
  }
}
