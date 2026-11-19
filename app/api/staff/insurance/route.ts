import { NextRequest, NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getMysql } from "@/lib/mysql";
import { parseMoney } from "@/lib/money.mjs";
import { requirePermission } from "@/lib/session";
import { sameOrigin } from "@/lib/write-request";

const fields = ["company_pay", "persenal_pay", "persenal_pay_D"] as const;
const methods = ["FULL", "NULL", "HALF", "HALF-D"];

export async function GET(request: NextRequest) {
  const denied = await requirePermission(request, ["staff_insurancedetail"]);
  if (denied) return denied;
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!/^[1-9]\d{0,9}$/.test(id)) return NextResponse.json({ error: "人员编号无效" }, { status: 400 });
  try {
    const [rows] = await getMysql().execute<RowDataPacket[]>("SELECT insure_pay, company_pay, persenal_pay, persenal_pay_D FROM staff_staff WHERE id = ?", [id]);
    return rows.length ? NextResponse.json(rows[0], { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "人员不存在" }, { status: 404 });
  } catch { return NextResponse.json({ error: "社保设置暂不可用" }, { status: 503 }); }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const denied = await requirePermission(request, ["staff_insurancedetail", "staff_insurancedetail_change"]);
  if (denied) return denied;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
  if (!Number.isSafeInteger(body.id) || body.id < 1 || !body.expected || typeof body.expected !== "object" || !methods.includes(body.insure_pay) || !(body.expected.insure_pay === null || methods.includes(body.expected.insure_pay))) return NextResponse.json({ error: "社保设置无效" }, { status: 400 });
  const amounts: (number | null)[] = [];
  for (const field of fields) {
    if (!(body.expected[field] === null || (typeof body.expected[field] === "number" && Number.isFinite(body.expected[field])))) return NextResponse.json({ error: "记录版本无效" }, { status: 400 });
    const amount = body[field] === null || body[field] === "" ? null : parseMoney(body[field]);
    if (amount !== null && (amount < 0 || amount > 100000000000)) return NextResponse.json({ error: "请输入有效金额" }, { status: 400 });
    if (amount === null && body[field] !== null && body[field] !== "") return NextResponse.json({ error: "请输入有效金额" }, { status: 400 });
    amounts.push(amount === null ? null : amount / 100);
  }
  try {
    const [result] = await getMysql().execute<ResultSetHeader>("UPDATE staff_staff SET insure_pay = ?, company_pay = ?, persenal_pay = ?, persenal_pay_D = ? WHERE id = ? AND insure_pay <=> ? AND company_pay <=> ? AND persenal_pay <=> ? AND persenal_pay_D <=> ?", [body.insure_pay, ...amounts, body.id, body.expected.insure_pay, ...fields.map((field) => body.expected[field])]);
    return result.affectedRows ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "人员社保设置已变化或不存在，请刷新后重试" }, { status: 409 });
  } catch { return NextResponse.json({ error: "保存结果未知，请刷新后确认" }, { status: 503 }); }
}
