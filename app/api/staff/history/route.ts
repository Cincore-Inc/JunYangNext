import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getMysql } from "@/lib/mysql";
import { requirePermission } from "@/lib/session";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const kind = params.get("kind"), id = params.get("id") || "", month = params.get("month") || "";
  const page = Number(params.get("page") || "1"), size = Number(params.get("pageSize") || "10");
  if ((kind !== "salary" && kind !== "insurance") || !/^[1-9]\d{0,9}$/.test(id) || (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) || !Number.isInteger(page) || page < 1 || page > 10000 || ![10, 20, 50].includes(size)) return NextResponse.json({ error: "查询条件无效" }, { status: 400 });
  const denied = await requirePermission(request, [kind === "salary" ? "staff_salarydetail" : "staff_insurancedetail"]);
  if (denied) return denied;
  const table = kind === "salary" ? "staff_salarydetail" : "staff_insurancedetail";
  const columns = kind === "salary" ? "d.salary, d.persenal_pay, d.personal_tax, d.commission, d.deduction, d.real_salary" : "d.company_pay, d.persenal_pay, d.persenal_pay_D, d.insure_pay, DATE_FORMAT(d.persenal_pay_date, '%Y-%m-%d') AS persenal_pay_date, d.company_payproof, d.persenal_payproof";
  const filter = `d.staff_id = ?${month ? " AND d.date >= ? AND d.date < DATE_ADD(?, INTERVAL 1 MONTH)" : ""}`;
  const args = month ? [id, `${month}-01`, `${month}-01`] : [id];
  try {
    const db = getMysql();
    const [counts] = await db.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM ${table} d WHERE ${filter}`, args);
    const [rows] = await db.execute<RowDataPacket[]>(`SELECT d.id, DATE_FORMAT(d.date, '%Y-%m-%d') AS date, ${columns} FROM ${table} d WHERE ${filter} ORDER BY d.date DESC, d.id DESC LIMIT ? OFFSET ?`, [...args, size, (page - 1) * size]);
    const items = rows.map((row) => kind === "insurance" ? { ...row, company_payproof: Boolean(row.company_payproof), persenal_payproof: Boolean(row.persenal_payproof) } : row);
    return NextResponse.json({ total: counts[0].total, items }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "人员明细暂不可用" }, { status: 503 }); }
}
