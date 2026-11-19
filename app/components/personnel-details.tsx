"use client";

import { useEffect, useState } from "react";
import { Alert, App, Button, Card, DatePicker, Drawer, Form, Input, Popconfirm, Select, Space, Table, Upload } from "antd";
import { DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import FormDrawer from "./form-drawer";
import Money from "./money";
import StatusTag from "./status-tag";
import StringDatePicker from "./string-date-picker";
import { useAccess } from "./access";
import { certificateStatuses, certificateStatusLabel } from "@/lib/certificate-status";

type Kind = "salary" | "insurance" | "certificates";
type Row = { id: number; staff: number; staff_name: string | null; date: string | null; salary: number | null; personal_tax: number | null; persenal_pay: number | null; commission: number | null; deduction: number | null; real_salary: number | null; company_pay: number | null; persenal_pay_D: number | null; insure_pay: string | null; insure_status: string | null; company_pay_date: string | null; persenal_pay_date: string | null; company_payproof: boolean; persenal_payproof: boolean; cert_name: string | null; cert_person_name: string | null; cert_start_date: string | null; cert_end_date: string | null; cert_sure: string | null; cert_next_date: string | null; cert_status: string | null };
type StaffOption = { id: number; name: string };
const methods: Record<string, string> = { FULL: "公司全缴", NULL: "个人缴纳", HALF: "部分公司缴纳", "HALF-D": "公司代扣代缴" };
const money = (value: number | null) => <Money value={value} unit="yuan" />;

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "操作失败");
  return data;
}

export default function PersonnelDetails({ kind, staffContext }: { kind: Kind; staffContext?: { id: number; name: string } }) {
  const { can, administrator } = useAccess();
  const staffId = staffContext?.id;
  const canTax = can("salarydetail_view", "salarydetail_change", "salarydetail_deduction_change");
  const canDeduction = can("salarydetail_view", "salarydetail_change", "salarydetail_commission_change");
  const canEdit = kind === "salary" ? canTax || canDeduction : kind === "insurance" ? can("insurancedetail_view", "staff_insurancedetail_change") : can("certificate_view", "certificate_add");
  const canCreate = kind === "salary" ? canTax && canDeduction : canEdit;
  const selectable = kind === "insurance" ? can("insurancedetail_download") : kind === "certificates" && (can("certificate_cert_status_change") || administrator);
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("");
  const [status, setStatus] = useState("");
  const [monthDraft, setMonthDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState("");
  const [insurePay, setInsurePay] = useState("");
  const [insurePayDraft, setInsurePayDraft] = useState("");
  const [dateSort, setDateSort] = useState<"asc" | "desc">("desc");
  const [orderBy, setOrderBy] = useState("");
  const [orderDirection, setOrderDirection] = useState("asc");
  const emptyCertFilters = () => ({ certName: "", sure: "", dateField: "cert_end_date", from: "", to: "" });
  const [certDraft, setCertDraft] = useState(emptyCertFilters);
  const [certFilters, setCertFilters] = useState(emptyCertFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<{ total: number; items: Row[] }>({ total: 0, items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [staff, setStaff] = useState<StaffOption[]>(staffContext ? [staffContext] : []);
  const [preview, setPreview] = useState<{ id: number; field: string; label: string } | null>(null);
  const [selectedRows, setSelectedRows] = useState<Row[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchStatus, setBatchStatus] = useState("");
  const [batchDate, setBatchDate] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ kind, page: String(page), pageSize: String(pageSize), q: query, month, status, insurePay, sort: dateSort, orderBy, orderDirection, ...certFilters, ...(staffId ? { staffId: String(staffId) } : {}) });
    json<{ total: number; items: Row[] }>(`/api/personnel?${params}`, { signal: controller.signal }).then(setData).catch((e) => { if (e.name !== "AbortError") { setData({ total: 0, items: [] }); setError(e.message); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, page, pageSize, query, month, status, insurePay, dateSort, orderBy, orderDirection, certFilters, revision, staffId]);
  const refresh = () => { setLoading(true); setError(""); setRevision((value) => value + 1); };
  const findStaff = async (q = "") => {
    try { const result = await json<{ items: StaffOption[] }>(`/api/staff/options?${new URLSearchParams({ q })}`); setStaff(result.items); }
    catch (e) { message.error(e instanceof Error ? e.message : "无法读取人员"); }
  };
  const open = async (row?: Row) => {
    form.resetFields();
    if (kind === "certificates") {
      if (!staffContext) await findStaff(row?.cert_person_name || "");
      form.setFieldsValue({ staff_id: staffContext?.id || row?.staff, cert_name: row?.cert_name || "", cert_start_date: row?.cert_start_date || "", cert_end_date: row?.cert_end_date || "", cert_sure: row?.cert_sure || "ON", cert_next_date: row?.cert_next_date || "", cert_status: row?.cert_status || "" });
    } else if (row) {
      form.setFieldsValue({ personal_tax: row.personal_tax == null ? "" : String(row.personal_tax), deduction: row.deduction == null ? "" : String(row.deduction), company_pay: row.company_pay == null ? "" : String(row.company_pay), persenal_pay: row.persenal_pay == null ? "" : String(row.persenal_pay), persenal_pay_D: row.persenal_pay_D == null ? "" : String(row.persenal_pay_D), insure_pay: row.insure_pay, insure_status: row.insure_status, company_pay_date: row.company_pay_date || "", persenal_pay_date: row.persenal_pay_date || "" });
    } else {
      await findStaff();
      form.setFieldsValue({ month: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" }).format(new Date()), salary: "0", personal_tax: "0", persenal_pay: "0", commission: "0", deduction: "0", company_pay: "0", persenal_pay_D: "0", insure_status: "OFF", insure_pay: "FULL" });
    }
    setEditing(row || "new");
  };
  const save = async () => {
    try {
      const values = await form.validateFields(); setSaving(true);
      const selected = editing !== "new" ? editing : null;
      if (kind === "salary" && selected) {
        for (const field of ["personal_tax", "deduction"] as const) if (Object.hasOwn(values, field) && (selected[field] == null ? !values[field] : values[field] !== "" && Number(values[field]) === selected[field])) delete values[field];
        if (!Object.hasOwn(values, "personal_tax") && !Object.hasOwn(values, "deduction")) { setEditing(null); return; }
      }
      if (kind === "insurance" && selected) {
        values.insure_pay ??= null; values.insure_status ??= null;
        for (const field of ["company_pay_date", "persenal_pay_date"] as const) if ((values[field] || "") === (selected[field] || "")) delete values[field];
      }
      const expected = selected && (kind === "certificates" ? { cert_name: selected.cert_name, cert_person_name: selected.cert_person_name, cert_start_date: selected.cert_start_date, cert_end_date: selected.cert_end_date, cert_sure: selected.cert_sure, cert_next_date: selected.cert_next_date, cert_status: selected.cert_status, staff_id: selected.staff } : selected);
      await json(kind === "certificates" ? "/api/personnel/certificate" : "/api/personnel", { method: kind === "certificates" || !selected ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, kind, ...(selected ? { id: selected.id, expected } : {}) }) });
      message.success("已保存"); setEditing(null); refresh();
    } catch (e) { if (e instanceof Error) message.error(e.message); } finally { setSaving(false); }
  };
  const batch = async (action: "update" | "delete") => {
    try {
      setSaving(true);
      await json("/api/personnel/certificate-batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, status: batchStatus, nextDate: batchDate, records: selectedRows.map((row) => ({ id: row.id, status: row.cert_status, nextDate: row.cert_next_date })) }) });
      message.success("批量操作完成"); setSelectedRows([]); setBatchOpen(false); refresh();
    } catch (e) { message.error(e instanceof Error ? e.message : "批量操作失败"); } finally { setSaving(false); }
  };
  const download = async () => {
    try {
      setSaving(true);
      const response = await fetch("/api/personnel/insurance-download", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: selectedRows.map((row) => row.id) }) });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || "下载失败"); }
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = "insurance-proofs.zip"; link.click(); URL.revokeObjectURL(url);
    } catch (e) { message.error(e instanceof Error ? e.message : "下载失败"); } finally { setSaving(false); }
  };
  const amount = (name: string, label: string) => <Form.Item name={name} label={label} rules={[{ required: !(editing && editing !== "new" && ((kind === "salary" && (name === "personal_tax" || name === "deduction") && editing[name] == null) || (kind === "insurance" && (name === "company_pay" || name === "persenal_pay" || name === "persenal_pay_D") && editing[name] == null))), pattern: /^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/, message: "请输入非负金额，最多两位小数" }]}><Input inputMode="decimal" /></Form.Item>;
  const columns = kind === "salary" ? [
    { title: "月份", dataIndex: "date", width: 110 }, { title: "工资明细编号", dataIndex: "id", width: 140 }, { title: "员工姓名", dataIndex: "staff_name", width: 120 },
    ...([["salary", "基本工资"], ["personal_tax", "个税"], ["persenal_pay", "个人社保"], ["commission", "提成"], ["deduction", "扣款"], ["real_salary", "实发工资"]] as const).map(([dataIndex, title]) => ({ title, dataIndex, width: 130, render: money })),
  ] : kind === "insurance" ? [
    { title: "人员", dataIndex: "staff_name", width: 120 }, { title: "月份", dataIndex: "date", width: 110, sorter: true, sortOrder: dateSort === "asc" ? "ascend" as const : "descend" as const }, { title: "缴纳方式", dataIndex: "insure_pay", width: 140, render: (value: string) => methods[value] || "—" },
    ...([["company_pay", "公司应缴"], ["persenal_pay", "个人应缴"], ["persenal_pay_D", "公司代扣"]] as const).map(([dataIndex, title]) => ({ title, dataIndex, width: 130, render: money })),
    { title: "缴纳状态", dataIndex: "insure_status", width: 110, render: (value: string) => <StatusTag value={value === "ON" ? "已缴纳" : value === "OFF" ? "未缴纳" : ""} /> }, { title: "公司缴纳日期", dataIndex: "company_pay_date", width: 150, render: (value: string) => value || "—" }, { title: "个人缴纳日期", dataIndex: "persenal_pay_date", width: 150, render: (value: string) => value || "—" },
    ...([["company_payproof", "公司凭证"], ["persenal_payproof", "个人凭证"]] as const).map(([field, label]) => ({ title: label, dataIndex: field, width: 160, render: (present: boolean, row: Row) => <Space size={4}>{present && <Button size="small" onClick={() => setPreview({ id: row.id, field, label })}>预览</Button>}{can(field === "company_payproof" ? "insurancedetail_company_payproof" : "insurancedetail_persenal_payproof") && <Upload accept="image/png,image/jpeg" showUploadList={false} customRequest={async ({ file, onSuccess, onError }) => { try { const body = new FormData(); body.set("id", String(row.id)); body.set("field", field); body.set("file", file); const result = await json("/api/personnel/insurance-file", { method: "POST", body }); message.success("凭证已上传"); onSuccess?.(result); refresh(); } catch (e) { const error = e instanceof Error ? e : new Error("上传失败"); message.error(error.message); onError?.(error); } }}><Button size="small" icon={<UploadOutlined />}>{present ? "替换" : "上传"}</Button></Upload>}</Space> })),
  ] : [
    { title: "证件名称", dataIndex: "cert_name", width: 180 }, { title: "持证人", dataIndex: "cert_person_name", width: 120 }, { title: "生效日期", dataIndex: "cert_start_date", width: 120, sorter: true }, { title: "到期日期", dataIndex: "cert_end_date", width: 120, sorter: true }, { title: "年审要求", dataIndex: "cert_sure", width: 110, render: (v: string) => <StatusTag value={v === "ON" ? "需要年审" : v === "OFF" ? "不年审" : ""} /> }, { title: "下次年审", dataIndex: "cert_next_date", width: 120, sorter: true }, { title: "年审状态", dataIndex: "cert_status", width: 100, render: (v: string) => <StatusTag value={certificateStatusLabel(v)} /> },
  ];
  const searchRows = () => { setSelectedRows([]); setPage(1); setQuery(search.trim()); setMonth(monthDraft); setStatus(statusDraft); setInsurePay(insurePayDraft); setCertFilters(certDraft); refresh(); };
  return <div className="dashboard"><Card variant="borderless" className="panel filter-panel"><div className="toolbar">{!staffContext && <div className="filter-field"><label htmlFor="personnel-search">人员姓名</label><Input id="personnel-search" value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={searchRows} allowClear /></div>}{kind !== "certificates" ? <div className="filter-field"><label htmlFor="personnel-month">月份</label><DatePicker id="personnel-month" picker="month" placeholder="选择月份" format="YYYY-MM" value={monthDraft ? dayjs(`${monthDraft}-01`) : null} onChange={(value) => setMonthDraft(value ? value.format("YYYY-MM") : "")} /></div> : <><div className="filter-field"><label htmlFor="certificate-name">证件名称</label><Input id="certificate-name" value={certDraft.certName} onChange={(e) => setCertDraft({ ...certDraft, certName: e.target.value })} /></div><div className="filter-field"><label htmlFor="certificate-status">年审状态</label><Select id="certificate-status" value={statusDraft} onChange={setStatusDraft} options={[{ value: "", label: "全部" }, ...certificateStatuses]} /></div><div className="filter-field"><label htmlFor="certificate-sure">年审要求</label><Select id="certificate-sure" value={certDraft.sure} onChange={(value) => setCertDraft({ ...certDraft, sure: value })} options={[{ value: "", label: "全部" }, { value: "ON", label: "需要年审" }, { value: "OFF", label: "不年审" }]} /></div><div className="filter-field"><label htmlFor="certificate-date-field">日期类型</label><Select id="certificate-date-field" value={certDraft.dateField} onChange={(value) => setCertDraft({ ...certDraft, dateField: value })} options={[{ value: "cert_start_date", label: "生效日期" }, { value: "cert_end_date", label: "到期日期" }, { value: "cert_next_date", label: "下次年审" }]} /></div><div className="filter-field"><label htmlFor="certificate-from">开始</label><StringDatePicker id="certificate-from" value={certDraft.from} onChange={(value) => setCertDraft({ ...certDraft, from: value })} /></div><div className="filter-field"><label htmlFor="certificate-to">结束</label><StringDatePicker id="certificate-to" value={certDraft.to} onChange={(value) => setCertDraft({ ...certDraft, to: value })} /></div></>}{kind === "insurance" && <><div className="filter-field"><label htmlFor="insurance-method">缴纳方式</label><Select id="insurance-method" value={insurePayDraft} onChange={setInsurePayDraft} options={[{ value: "", label: "全部" }, ...Object.entries(methods).map(([value, label]) => ({ value, label }))]} /></div><div className="filter-field"><label htmlFor="insurance-status">缴纳状态</label><Select id="insurance-status" value={statusDraft} onChange={setStatusDraft} options={[{ value: "", label: "全部" }, { value: "ON", label: "已缴纳" }, { value: "OFF", label: "未缴纳" }]} /></div></>}<Space><Button type="primary" onClick={searchRows}>查询</Button><Button onClick={() => { setSelectedRows([]); setSearch(""); setQuery(""); setMonth(""); setStatus(""); setMonthDraft(""); setStatusDraft(""); setInsurePay(""); setInsurePayDraft(""); setCertDraft(emptyCertFilters()); setCertFilters(emptyCertFilters()); setPage(1); refresh(); }}>重置</Button></Space></div></Card>
    <Card variant="borderless" className="panel project-panel"><div className="table-actions"><Space>{canCreate && <Button type="primary" onClick={() => open()}>{kind === "salary" ? "新增工资明细" : kind === "insurance" ? "新增社保明细" : "新增证件"}</Button>}{kind === "insurance" && can("insurancedetail_download") && <Button disabled={!selectedRows.length} loading={saving} icon={<DownloadOutlined />} onClick={download}>批量下载凭证</Button>}{kind === "certificates" && can("certificate_cert_status_change") && <><Button disabled={!selectedRows.length} onClick={() => { setBatchStatus(""); setBatchDate(""); setBatchOpen(true); }}>批量年审</Button></>}{kind === "certificates" && administrator && <Popconfirm title={`确定删除选中的 ${selectedRows.length} 条证件？`} onConfirm={() => batch("delete")}><Button danger disabled={!selectedRows.length} loading={saving}>批量删除</Button></Popconfirm>}</Space></div>{error && <Alert className="error" type="error" showIcon message={error} />}
      <Table<Row> rowKey="id" rowSelection={!selectable ? undefined : { selectedRowKeys: selectedRows.map((row) => row.id), onChange: (_, rows) => setSelectedRows(rows) }} loading={loading} dataSource={data.items} scroll={{ x: 1100 }} pagination={{ current: page, pageSize, total: data.total, showSizeChanger: true, pageSizeOptions: kind === "salary" ? [10, 20, 50] : [10, 20, 30, 40], showTotal: (total) => `共 ${total} 条`, onChange: (value, size) => { setSelectedRows([]); setLoading(true); setPage(size !== pageSize ? 1 : value); setPageSize(size); } }} onChange={(_, __, sorter, extra) => { if (extra.action === "sort" && (kind === "insurance" || kind === "certificates")) { const current = Array.isArray(sorter) ? sorter[0] : sorter; setSelectedRows([]); setPage(1); if (kind === "insurance") setDateSort(current?.order === "ascend" ? "asc" : "desc"); else { setOrderBy(current?.order && typeof current.field === "string" ? current.field : ""); setOrderDirection(current?.order === "descend" ? "desc" : "asc"); } refresh(); } }} summary={kind !== "certificates" ? (rows) => rows.length ? <Table.Summary.Row>{selectable && <Table.Summary.Cell index={0} />}{columns.map((column, index) => { const field = column.dataIndex as keyof Row; const amountFields = kind === "salary" ? ["salary", "personal_tax", "persenal_pay", "commission", "deduction", "real_salary"] : ["company_pay", "persenal_pay", "persenal_pay_D"]; return <Table.Summary.Cell index={index + (selectable ? 1 : 0)} key={field}>{index === 0 ? "本页合计" : amountFields.includes(field) ? <Money value={rows.reduce((sum, row) => sum + Math.round((Number(row[field]) || 0) * 100), 0)} /> : null}</Table.Summary.Cell>; })}{canEdit && <Table.Summary.Cell index={columns.length + (selectable ? 1 : 0)} />}</Table.Summary.Row> : null : undefined} columns={[...columns, ...(canEdit ? [{ title: "操作", width: 90, fixed: "right" as const, render: (_: unknown, row: Row) => <Button size="small" onClick={() => open(row)}>编辑</Button> }] : [])]} />
      <FormDrawer title={kind === "salary" ? editing === "new" ? "新增工资明细" : "修改工资明细" : kind === "insurance" ? editing === "new" ? "新增社保明细" : "修改社保明细" : editing === "new" ? "新增证件" : "编辑证件"} open={editing !== null} onCancel={() => setEditing(null)} onOk={save} confirmLoading={saving}><Form form={form} layout="vertical" preserve={false}>
        {editing === "new" && kind !== "certificates" && <><Form.Item name="staff_id" label="人员" rules={[{ required: true }]}><Select showSearch filterOption={false} onSearch={findStaff} options={staff.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item><Form.Item name="month" label="月份" rules={[{ required: true }]} getValueProps={(value: string) => ({ value: value ? dayjs(`${value}-01`) : null })} normalize={(value) => value ? value.format("YYYY-MM") : ""}><DatePicker picker="month" format="YYYY-MM" placeholder="选择月份" style={{ width: "100%" }} /></Form.Item></>}
        {kind === "salary" ? <>{editing === "new" && amount("salary", "基本工资（元）")}{(editing === "new" || canTax) && amount("personal_tax", "个人所得税（元）")}{editing === "new" && <>{amount("persenal_pay", "个人社保（元）")}{amount("commission", "提成（元）")}</>}{(editing === "new" || canDeduction) && amount("deduction", "扣款（元）")}</> : kind === "insurance" ? <>{amount("company_pay", "公司应缴（元）")}{amount("persenal_pay", "个人应缴（元）")}{amount("persenal_pay_D", "公司代扣（元）")}<Form.Item name="insure_pay" label="缴纳方式" rules={[{ required: editing === "new" }]}><Select allowClear={editing !== "new"} options={Object.entries(methods).map(([value, label]) => ({ value, label }))} /></Form.Item><Form.Item name="insure_status" label="缴纳状态" rules={[{ required: editing === "new" }]}><Select allowClear={editing !== "new"} options={[{ value: "ON", label: "已缴纳" }, { value: "OFF", label: "未缴纳" }]} /></Form.Item>{editing !== "new" && ([ ["company_pay_date", "公司缴纳日期"], ["persenal_pay_date", "个人转账日期"] ] as const).map(([name, label]) => <Form.Item key={name} name={name} label={label}><StringDatePicker style={{ width: "100%" }} /></Form.Item>)}</> : <><Form.Item name="staff_id" label="持证人" rules={[{ required: true }]}><Select disabled={!!staffContext} showSearch filterOption={false} onSearch={findStaff} options={staff.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item><Form.Item name="cert_name" label="证件名称" rules={[{ required: true, whitespace: true, max: 50 }]}><Input maxLength={50} /></Form.Item>{([['cert_start_date', '生效日期'], ['cert_end_date', '到期日期'], ['cert_next_date', '下次年审日期']] as const).map(([name, label]) => <Form.Item key={name} name={name} label={label}><StringDatePicker style={{ width: "100%" }} /></Form.Item>)}<Form.Item name="cert_sure" label="是否年审" rules={[{ required: true }]}><Select options={[{ value: "ON", label: "需要年审" }, { value: "OFF", label: "不年审" }]} /></Form.Item><Form.Item name="cert_status" label="年审状态"><Select options={[{ value: "", label: "未设置" }, ...certificateStatuses]} /></Form.Item></>}
      </Form></FormDrawer>
      <FormDrawer title={`批量年审（${selectedRows.length} 条）`} open={batchOpen} onCancel={() => setBatchOpen(false)} onOk={() => batch("update")} confirmLoading={saving}><Space direction="vertical" style={{ width: "100%" }} size="large"><div><label htmlFor="batch-status">年审状态</label><Select id="batch-status" style={{ width: "100%" }} value={batchStatus} onChange={setBatchStatus} options={[{ value: "", label: "不修改" }, ...certificateStatuses]} /></div><div><label htmlFor="batch-date">下次年审日期（留空不修改）</label><StringDatePicker id="batch-date" style={{ width: "100%" }} value={batchDate} onChange={setBatchDate} /></div></Space></FormDrawer>
      <Drawer title={preview?.label || "凭证预览"} width="min(720px, 100vw)" open={!!preview} onClose={() => setPreview(null)} destroyOnHidden extra={preview && <Button icon={<DownloadOutlined />} href={`/api/personnel/insurance-file?${new URLSearchParams({ id: String(preview.id), field: preview.field, download: "1" })}`}>下载</Button>}>{preview && <iframe title={`${preview.label}预览`} className="attachment-preview" src={`/api/personnel/insurance-file?${new URLSearchParams({ id: String(preview.id), field: preview.field })}`} />}</Drawer>
    </Card>
  </div>;
}
