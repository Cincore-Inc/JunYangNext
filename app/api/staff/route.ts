import { requirePermission } from "@/lib/session";
import { getMysql } from "@/lib/mysql";
import type { RowDataPacket } from "mysql2";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requirePermission(request, ["staff_view"]);
  if (denied) return denied;
  const q = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
  const status = request.nextUrl.searchParams.get("status") || "";
  const insurance = request.nextUrl.searchParams.get("insurance") || "";
  const from = request.nextUrl.searchParams.get("from") || "", to = request.nextUrl.searchParams.get("to") || "";
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (status && !["ON", "OFF", "ON-TRY", "ON-HALF", "__unset__"].includes(status)) return NextResponse.json({ error: "人员状态无效" }, { status: 400 });
  if ((insurance && !["FULL", "NULL", "HALF", "HALF-D", "__unset__"].includes(insurance)) || (from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) return NextResponse.json({ error: "人员筛选条件无效" }, { status: 400 });
  const page = Math.max(1, Math.min(10000, parseInt(request.nextUrl.searchParams.get("page") || "1", 10) || 1));
  const pageSizeParam = request.nextUrl.searchParams.get("pageSize");
  const pageSize = pageSizeParam === null ? 20 : Number(pageSizeParam);
  if (!Number.isInteger(pageSize) || ![10, 20, 50].includes(pageSize)) return NextResponse.json({ error: "每页条数无效" }, { status: 400 });
  try {
    const [personalDenied, salaryDenied, insuranceDenied] = await Promise.all([requirePermission(request, ["staff_staff"]), requirePermission(request, ["salarydetail_view"]), requirePermission(request, ["insurancedetail_view"])]);
    for (const result of [personalDenied, salaryDenied, insuranceDenied]) if (result && result.status !== 403) return result;
    if (insurance && insuranceDenied) return insuranceDenied;
    const where = ["1=1"], values: (string | number)[] = [];
    if (q) { where.push("s.name LIKE ?"); values.push(`%${q.replace(/[\\%_]/g, "\\$&")}%`); }
    if (status === "__unset__") where.push("(s.staff_status IS NULL OR s.staff_status = '')");
    else if (status) { where.push("s.staff_status = ?"); values.push(status); }
    if (insurance === "__unset__") where.push("(s.insure_pay IS NULL OR s.insure_pay = '')");
    else if (insurance) { where.push("s.insure_pay = ?"); values.push(insurance); }
    if (from && to) { where.push("s.entrydate BETWEEN ? AND ?"); values.push(from, to); }
    else if (from) { where.push("s.entrydate >= ?"); values.push(from); }
    else if (to) { where.push("s.entrydate <= ?"); values.push(to); }
    const db = getMysql(), filter = where.join(" AND ");
    const [counts] = await db.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM staff_staff s WHERE ${filter}`, values);
    const [rows] = await db.execute<RowDataPacket[]>(`SELECT s.id, s.name, s.position, c.name AS company, s.staff_status AS status, DATE_FORMAT(s.entrydate, '%Y-%m-%d') AS entryDate, u.username ${!personalDenied ? ", s.phone" : ""}${!salaryDenied ? ", s.salary, s.percentage" : ""}${!insuranceDenied ? ", s.insure_pay AS insurePay" : ""} FROM staff_staff s LEFT JOIN company_companys c ON c.id=s.company_id LEFT JOIN auth_user u ON u.id=s.user_id WHERE ${filter} ORDER BY s.id DESC LIMIT ? OFFSET ?`, [...values, pageSize, (page - 1) * pageSize]);
    return NextResponse.json({ total: counts[0].total, items: rows }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "无法读取人员数据，请检查连接" }, { status: 503 });
  }
}
