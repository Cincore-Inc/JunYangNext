import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { getMysql } from "@/lib/mysql";
import { parseMoney } from "@/lib/money.mjs";
import { sameOrigin } from "@/lib/write-request";
import { isCertificateStatus } from "@/lib/certificate-status";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

const config = {
  salary: { endpoint: "salarydetail", permission: "salarydetail_view", fields: ["id", "staff", "staff_name", "date", "salary", "personal_tax", "persenal_pay", "commission", "deduction", "real_salary"] },
  insurance: { endpoint: "insurancedetail", permission: "insurancedetail_view", fields: ["id", "staff", "staff_name", "date", "insure_pay", "company_pay", "persenal_pay", "persenal_pay_D", "insure_status", "company_pay_date", "persenal_pay_date", "company_payproof", "persenal_payproof"] },
  certificates: { endpoint: "cert", permission: "certificate_view", fields: ["id", "staff", "cert_name", "cert_person_name", "cert_start_date", "cert_end_date", "cert_sure", "cert_next_date", "cert_status"] },
  exams: { endpoint: "exam", permission: "exam_view", fields: ["id", "staff", "exam_name", "exam_person_name", "exam_date", "exam_status", "cert_date", "cert_status"] },
} as const;

export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind") as keyof typeof config;
  if (!Object.hasOwn(config, kind)) return NextResponse.json({ error: "类型无效" }, { status: 400 });
  const staffId = request.nextUrl.searchParams.get("staffId") || "";
  if (staffId && (!/^[1-9]\d{0,9}$/.test(staffId) || !["certificates", "exams"].includes(kind))) return NextResponse.json({ error: "人员编号无效" }, { status: 400 });
  const denied = await requirePermission(request, [config[kind].permission]);
  if (denied) return denied;
  const page = Math.max(1, Math.min(10000, parseInt(request.nextUrl.searchParams.get("page") || "1", 10) || 1));
  const pageSizeParam = request.nextUrl.searchParams.get("pageSize");
  const pageSize = pageSizeParam === null ? 20 : Number(pageSizeParam);
  if (!Number.isInteger(pageSize) || !(kind === "salary" ? [10, 20, 50] : [10, 20, 30, 40]).includes(pageSize)) return NextResponse.json({ error: "每页条数无效" }, { status: 400 });
  const q = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 50);
  const month = request.nextUrl.searchParams.get("month") || "";
  const status = request.nextUrl.searchParams.get("status") || "";
  const insurePay = request.nextUrl.searchParams.get("insurePay") || "";
  const sort = request.nextUrl.searchParams.get("sort") || "desc";
  const orderBy = request.nextUrl.searchParams.get("orderBy") || "";
  const orderDirection = request.nextUrl.searchParams.get("orderDirection") || "asc";
  if (kind === "insurance" && ((insurePay && !["FULL", "NULL", "HALF", "HALF-D"].includes(insurePay)) || !["asc", "desc"].includes(sort))) return NextResponse.json({ error: "筛选或排序条件无效" }, { status: 400 });
  if (kind === "exams" && ((orderBy && !["exam_date", "cert_date"].includes(orderBy)) || !["asc", "desc"].includes(orderDirection))) return NextResponse.json({ error: "排序条件无效" }, { status: 400 });
  if (kind === "certificates" && ((orderBy && !["cert_start_date", "cert_end_date", "cert_next_date"].includes(orderBy)) || !["asc", "desc"].includes(orderDirection))) return NextResponse.json({ error: "排序条件无效" }, { status: 400 });
  if ((month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) || (status && !(kind === "certificates" ? isCertificateStatus(status) : ["ON", "OFF"].includes(status)))) return NextResponse.json({ error: "筛选条件无效" }, { status: 400 });
  const params = new URLSearchParams({ page: String(page), page_size: "20" });
  if (q) params.set(kind === "certificates" ? "search_staffname" : kind === "exams" ? "search_name" : "search", q);
  if (month && kind !== "certificates" && kind !== "exams") params.set("date", `${month}-01`);
  if (status && kind === "certificates") params.set("cert_status", status);
  if (kind === "certificates") {
    const certName = (request.nextUrl.searchParams.get("certName") || "").trim().slice(0, 50);
    const field = request.nextUrl.searchParams.get("dateField") || "cert_end_date";
    const from = request.nextUrl.searchParams.get("from") || "", to = request.nextUrl.searchParams.get("to") || "";
    const sure = request.nextUrl.searchParams.get("sure") || "";
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    if ((sure && !["ON", "OFF"].includes(sure)) || !["cert_start_date", "cert_end_date", "cert_next_date"].includes(field) || ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to))) return NextResponse.json({ error: "证件筛选条件无效" }, { status: 400 });
    if (certName) params.set("search", certName);
    if (sure) params.set("cert_sure", sure);
    if (from || to) { params.set("field_date", field); if (from) params.set("start_date", from); if (to) params.set("end_date", to); }
  }
  if (kind === "exams") {
    const examStatus = request.nextUrl.searchParams.get("examStatus") || "", certStatus = request.nextUrl.searchParams.get("certStatus") || "";
    const examName = (request.nextUrl.searchParams.get("examName") || "").trim().slice(0, 50);
    const field = request.nextUrl.searchParams.get("dateField") || "exam_date";
    const from = request.nextUrl.searchParams.get("from") || "", to = request.nextUrl.searchParams.get("to") || "";
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    if ([examStatus, certStatus].some((value) => value && !["ON", "OFF"].includes(value))) return NextResponse.json({ error: "考试筛选条件无效" }, { status: 400 });
    if (!["exam_date", "cert_date"].includes(field) || ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to))) return NextResponse.json({ error: "考试日期范围无效" }, { status: 400 });
    if (examName) params.set("exam_name", examName);
    if (from || to) { params.set("field_date", field); if (from) params.set("start_date", from); if (to) params.set("end_date", to); }
    if (examStatus) params.set("exam_status", examStatus);
    if (certStatus) params.set("cert_status", certStatus);
  }
  try {
    const tables = { salary: "staff_salarydetail", insurance: "staff_insurancedetail", certificates: "staff_certificate", exams: "staff_exam" } as const;
    const columns = {
      salary: "d.id, d.staff_id AS staff, s.name AS staff_name, DATE_FORMAT(d.date, '%Y-%m-%d') AS date, d.salary, d.personal_tax, d.persenal_pay, d.commission, d.deduction, d.real_salary",
      insurance: "d.id, d.staff_id AS staff, s.name AS staff_name, DATE_FORMAT(d.date, '%Y-%m-%d') AS date, d.insure_pay, d.company_pay, d.persenal_pay, d.persenal_pay_D, d.insure_status, DATE_FORMAT(d.company_pay_date, '%Y-%m-%d') AS company_pay_date, DATE_FORMAT(d.persenal_pay_date, '%Y-%m-%d') AS persenal_pay_date, d.company_payproof, d.persenal_payproof",
      certificates: "d.id, d.staff_id AS staff, d.cert_name, d.cert_person_name, DATE_FORMAT(d.cert_start_date, '%Y-%m-%d') AS cert_start_date, DATE_FORMAT(d.cert_end_date, '%Y-%m-%d') AS cert_end_date, d.cert_sure, DATE_FORMAT(d.cert_next_date, '%Y-%m-%d') AS cert_next_date, d.cert_status",
      exams: "d.id, d.staff_id AS staff, d.exam_name, d.exam_person_name, DATE_FORMAT(d.exam_date, '%Y-%m-%d %H:%i') AS exam_date, d.exam_status, DATE_FORMAT(d.cert_date, '%Y-%m-%d %H:%i') AS cert_date, d.cert_status",
    } as const;
    const conditions = ["1=1"], values: (string | number)[] = [];
    if (kind === "certificates" || kind === "exams") { conditions.push("NOT EXISTS (SELECT 1 FROM junyang_deleted_personnel deleted WHERE deleted.kind = ? AND deleted.record_id = d.id)"); values.push(kind); }
    if (staffId) { conditions.push("d.staff_id = ?"); values.push(staffId); }
    const like = (field: string, value: string) => { if (value) { conditions.push(`${field} LIKE ?`); values.push(`%${value.replace(/[\\%_]/g, "\\$&")}%`); } };
    like(kind === "exams" ? "d.exam_person_name" : "s.name", q);
    if (month && (kind === "salary" || kind === "insurance")) { conditions.push("d.date >= ? AND d.date < DATE_ADD(?, INTERVAL 1 MONTH)"); values.push(`${month}-01`, `${month}-01`); }
    if (kind === "insurance" && status) { conditions.push("d.insure_status = ?"); values.push(status); }
    if (kind === "insurance" && insurePay) { conditions.push("d.insure_pay = ?"); values.push(insurePay); }
    if (kind === "certificates") {
      like("d.cert_name", params.get("search") || "");
      for (const field of ["cert_status", "cert_sure"] as const) if (params.has(field)) { conditions.push(`d.${field} = ?`); values.push(params.get(field)!); }
      if (params.has("start_date")) { conditions.push(`d.${params.get("field_date")} >= ?`); values.push(params.get("start_date")!); }
      if (params.has("end_date")) { conditions.push(`d.${params.get("field_date")} <= ?`); values.push(params.get("end_date")!); }
    }
    if (kind === "exams") {
      like("d.exam_name", params.get("exam_name") || "");
      for (const field of ["exam_status", "cert_status"] as const) if (params.has(field)) { conditions.push(`d.${field} = ?`); values.push(params.get(field)!); }
      if (params.has("start_date")) { conditions.push(`d.${params.get("field_date")} >= ?`); values.push(params.get("start_date")!); }
      if (params.has("end_date")) { conditions.push(`d.${params.get("field_date")} < DATE_ADD(?, INTERVAL 1 DAY)`); values.push(params.get("end_date")!); }
    }
    const db = getMysql(), table = tables[kind], where = conditions.join(" AND "), join = "LEFT JOIN staff_staff s ON s.id = d.staff_id";
    const [counts] = await db.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM ${table} d ${join} WHERE ${where}`, values);
    const order = (kind === "exams" || kind === "certificates") && orderBy ? `d.${orderBy} ${orderDirection === "asc" ? "ASC" : "DESC"}, d.id ASC` : kind === "insurance" && sort === "asc" ? "d.date ASC, d.id ASC" : kind === "salary" || kind === "insurance" ? "d.date DESC, d.id DESC" : "d.id ASC";
    const [rows] = await db.execute<RowDataPacket[]>(`SELECT ${columns[kind]} FROM ${table} d ${join} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, [...values, pageSize, (page - 1) * pageSize]);
    return NextResponse.json({ total: counts[0].total, items: rows.map((row) => Object.fromEntries(config[kind].fields.map((key) => [key, key === "company_payproof" || key === "persenal_payproof" ? Boolean(row[key]) : row[key] ?? null]))) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "人员数据暂不可用" }, { status: 503 }); }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
  if (!Number.isSafeInteger(body.id) || body.id < 1 || !["salary", "insurance"].includes(body.kind) || !body.expected || typeof body.expected !== "object") return NextResponse.json({ error: "参数无效" }, { status: 400 });
  const salaryFields = ["personal_tax", "deduction"].filter((field) => Object.hasOwn(body, field));
  if (body.kind === "salary" && !salaryFields.length) return NextResponse.json({ error: "没有要修改的金额" }, { status: 400 });
  const permissions = body.kind === "salary" ? ["salarydetail_view", "salarydetail_change", ...salaryFields.map((field) => field === "personal_tax" ? "salarydetail_deduction_change" : "salarydetail_commission_change")] : ["insurancedetail_view", "staff_insurancedetail_change"];
  const denied = await requirePermission(request, permissions);
  if (denied) return denied;
  const fields = body.kind === "salary" ? salaryFields : ["company_pay", "persenal_pay", "persenal_pay_D"];
  const amounts: number[] = [];
  for (const field of fields) {
    const value = parseMoney(body[field]);
    if (value === null || value < 0 || value > 100000000000) return NextResponse.json({ error: "请输入有效金额" }, { status: 400 });
    if (body.expected[field] !== null && (typeof body.expected[field] !== "number" || !Number.isFinite(body.expected[field]))) return NextResponse.json({ error: "记录版本无效" }, { status: 400 });
    amounts.push(value / 100);
  }
  if (body.kind === "insurance" && (!["ON", "OFF"].includes(body.insure_status) || !["FULL", "NULL", "HALF", "HALF-D"].includes(body.insure_pay) || !["ON", "OFF", null].includes(body.expected.insure_status) || !["FULL", "NULL", "HALF", "HALF-D", null].includes(body.expected.insure_pay))) return NextResponse.json({ error: "社保状态无效" }, { status: 400 });
  const dateFields = body.kind === "insurance" ? ["company_pay_date", "persenal_pay_date"].filter((field) => body[field] !== undefined) : [];
  const validDate = (value: unknown) => value === null || value === "" || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);
  if (dateFields.some((field) => !validDate(body[field]) || !Object.hasOwn(body.expected, field) || !validDate(body.expected[field]))) return NextResponse.json({ error: "缴纳日期无效" }, { status: 400 });
  try {
    const sql = body.kind === "salary"
      ? `UPDATE staff_salarydetail SET ${fields.map((field) => `${field} = ?`).join(", ")}, real_salary = CASE WHEN salary IS NOT NULL AND personal_tax IS NOT NULL AND persenal_pay IS NOT NULL AND commission IS NOT NULL AND deduction IS NOT NULL THEN ROUND(salary - personal_tax - persenal_pay + commission - deduction, 2) ELSE real_salary END WHERE id = ?${fields.map((field) => ` AND ${field} <=> ?`).join("")}`
      : `UPDATE staff_insurancedetail SET company_pay = ?, persenal_pay = ?, persenal_pay_D = ?, insure_status = ?, insure_pay = ?${dateFields.map((field) => `, ${field} = ?`).join("")} WHERE id = ? AND company_pay <=> ? AND persenal_pay <=> ? AND persenal_pay_D <=> ? AND insure_status <=> ? AND insure_pay <=> ?${dateFields.map((field) => ` AND ${field} <=> ?`).join("")}`;
    const args = body.kind === "salary" ? [...amounts, body.id, ...fields.map((field) => body.expected[field])] : [...amounts, body.insure_status, body.insure_pay, ...dateFields.map((field) => body[field] || null), body.id, ...fields.map((field) => body.expected[field]), body.expected.insure_status, body.expected.insure_pay, ...dateFields.map((field) => body.expected[field] || null)];
    const [result] = await getMysql().execute<ResultSetHeader>(sql, args);
    if (!result.affectedRows) return NextResponse.json({ error: "记录已变化或不存在，请刷新后重试" }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "保存结果未知，请刷新后确认" }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
  if (!["salary", "insurance"].includes(body.kind) || !Number.isSafeInteger(body.staff_id) || body.staff_id < 1 || typeof body.month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month)) return NextResponse.json({ error: "人员或月份无效" }, { status: 400 });
  const denied = await requirePermission(request, body.kind === "salary" ? ["salarydetail_view", "salarydetail_change", "salarydetail_deduction_change", "salarydetail_commission_change"] : ["insurancedetail_view", "staff_insurancedetail_change"]);
  if (denied) return denied;
  const fields = body.kind === "salary" ? ["salary", "personal_tax", "persenal_pay", "commission", "deduction"] : ["company_pay", "persenal_pay", "persenal_pay_D"];
  const amounts = fields.map((field) => parseMoney(body[field]));
  if (amounts.some((value) => value === null || value < 0 || value > 100000000000) || (body.kind === "insurance" && (!["ON", "OFF"].includes(body.insure_status) || !["FULL", "NULL", "HALF", "HALF-D"].includes(body.insure_pay)))) return NextResponse.json({ error: "请正确填写金额和状态" }, { status: 400 });
  const cents = amounts as number[];
  try {
    const connection = await getMysql().getConnection();
    try {
      await connection.beginTransaction();
      const [staff] = await connection.execute<RowDataPacket[]>("SELECT id FROM staff_staff WHERE id = ? FOR UPDATE", [body.staff_id]);
      if (!staff.length) { await connection.rollback(); return NextResponse.json({ error: "人员不存在" }, { status: 404 }); }
      const table = body.kind === "salary" ? "staff_salarydetail" : "staff_insurancedetail";
      const [existing] = await connection.execute<RowDataPacket[]>(`SELECT id FROM ${table} WHERE staff_id = ? AND date >= ? AND date < DATE_ADD(?, INTERVAL 1 MONTH) LIMIT 1`, [body.staff_id, `${body.month}-01`, `${body.month}-01`]);
      if (existing.length) { await connection.rollback(); return NextResponse.json({ error: "该人员本月已有明细" }, { status: 409 }); }
      if (body.kind === "salary") {
        const total = cents[0] - cents[1] - cents[2] + cents[3] - cents[4];
        if (!Number.isSafeInteger(total)) { await connection.rollback(); return NextResponse.json({ error: "工资金额超出范围" }, { status: 400 }); }
        await connection.execute("INSERT INTO staff_salarydetail (staff_id, date, salary, personal_tax, persenal_pay, commission, deduction, real_salary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [body.staff_id, `${body.month}-01`, ...cents.map((value) => value / 100), total / 100]);
      } else {
        await connection.execute("INSERT INTO staff_insurancedetail (staff_id, date, company_pay, persenal_pay, persenal_pay_D, insure_status, insure_pay) VALUES (?, ?, ?, ?, ?, ?, ?)", [body.staff_id, `${body.month}-01`, ...cents.map((value) => value / 100), body.insure_status, body.insure_pay]);
      }
      await connection.commit();
      return NextResponse.json({ ok: true });
    } catch { await connection.rollback(); throw new Error("Save failed"); } finally { connection.release(); }
  } catch { return NextResponse.json({ error: "保存结果未知，请刷新后确认" }, { status: 503 }); }
}
