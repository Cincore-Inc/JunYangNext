import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { getMongo } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { sameOrigin } from "@/lib/write-request";
import { deletionActor } from "@/lib/personnel-soft-delete";

export const dynamic = "force-dynamic";

async function change(request: NextRequest, action: "add" | "addSub" | "removeSub" | "remove") {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const denied = await requirePermission(request, ["file_view", action === "remove" || action === "removeSub" ? "project_file_delete" : "project_file_upload"]);
  if (denied) return denied;
  let body: { id?: string; name?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求无效" }, { status: 400 }); }
  if (!body || (action !== "add" && (typeof body.id !== "string" || !/^[a-f\d]{24}$/i.test(body.id))) || (action !== "remove" && (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100))) return NextResponse.json({ error: "分类参数无效" }, { status: 400 });
  try {
    const categories = (await getMongo()).db("junyang-files").collection<{ name: string; subCategories: string[]; enabled?: boolean; deletedAt?: Date; deletedBy?: number | null; deletedSubCategories?: { name: string; deletedAt: Date; deletedBy: number | null }[] }>("categories");
    const name = body.name?.trim() || "";
    if (action === "add") {
      if (await categories.findOne({ name, enabled: { $ne: false } })) return NextResponse.json({ error: "分类已存在" }, { status: 409 });
      const created = await categories.insertOne({ name, subCategories: [], enabled: true });
      return NextResponse.json({ ok: true, id: created.insertedId.toString() });
    } else {
      const filter = { _id: new ObjectId(body.id), enabled: { $ne: false } };
      const now = new Date();
      const result = action === "addSub" ? await categories.updateOne({ ...filter, subCategories: { $ne: name } }, { $addToSet: { subCategories: name } }) : action === "removeSub" ? await categories.updateOne({ ...filter, subCategories: name }, { $pull: { subCategories: name }, $push: { deletedSubCategories: { name, deletedAt: now, deletedBy: deletionActor(request) } } }) : await categories.updateOne(filter, { $set: { enabled: false, deletedAt: now, deletedBy: deletionActor(request) } });
      if (!result.matchedCount) return NextResponse.json({ error: "分类不存在、已删除或子分类已变化，请刷新后重试" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "操作结果未知，请刷新后确认" }, { status: 503 }); }
}
export async function POST(request: NextRequest) { return change(request, "add"); }
export async function PATCH(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");
  return action === "add" ? change(request, "addSub") : action === "remove" ? change(request, "removeSub") : NextResponse.json({ error: "操作无效" }, { status: 400 });
}
export async function DELETE(request: NextRequest) { return change(request, "remove"); }
