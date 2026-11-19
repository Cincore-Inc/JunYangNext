"use client";

import { useEffect, useState } from "react";
import { Alert, Button, DatePicker, Drawer, Space, Table, Tabs } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import Money from "./money";
import { useAccess } from "./access";

type Kind = "salary" | "insurance";
type Row = { id: number; date: string | null; salary: number | null; personal_tax: number | null; persenal_pay: number | null; persenal_pay_D: number | null; commission: number | null; deduction: number | null; real_salary: number | null; company_pay: number | null; persenal_pay_date: string | null; company_payproof: boolean; persenal_payproof: boolean };
const money = (value: number | null) => <Money value={value} unit="yuan" />;

export default function StaffHistory({ id, name }: { id: number; name: string }) {
  const { can } = useAccess();
  const [open, setOpen] = useState(false); const [kind, setKind] = useState<Kind>(can("staff_salarydetail") ? "salary" : "insurance");
  const [month, setMonth] = useState(""); const [draft, setDraft] = useState(""); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState<{ total: number; items: Row[] }>({ total: 0, items: [] }); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ id: number; field: string; label: string } | null>(null);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(`/api/staff/history?${new URLSearchParams({ id: String(id), kind, month, page: String(page), pageSize: String(pageSize) })}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error || "读取失败"); setData(result); setError(""); }).catch((e) => { if (e.name !== "AbortError") { setData({ total: 0, items: [] }); setError(e.message); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, id, kind, month, page, pageSize]);
  const proof = (field: "company_payproof" | "persenal_payproof", label: string) => ({ title: label, dataIndex: field, width: 120, render: (present: boolean, row: Row) => present ? <Button size="small" onClick={() => setPreview({ id: row.id, field, label })}>查看凭证</Button> : "—" });
  const columns = kind === "salary" ? [{ title: "月份", dataIndex: "date", width: 120 }, ...([ ["salary", "固定工资"], ["persenal_pay", "个人代扣"], ["personal_tax", "个人所得税"], ["commission", "提成"], ["deduction", "扣款"], ["real_salary", "实发工资"] ] as const).map(([dataIndex, title]) => ({ title, dataIndex, width: 130, render: money }))] : [{ title: "月份", dataIndex: "date", width: 120 }, { title: "公司缴纳", dataIndex: "company_pay", width: 130, render: money }, proof("company_payproof", "社保凭证"), { title: "个人转账日期", dataIndex: "persenal_pay_date", width: 140 }, { title: "个人缴纳", dataIndex: "persenal_pay", width: 130, render: money }, { title: "个人代扣", dataIndex: "persenal_pay_D", width: 130, render: money }, proof("persenal_payproof", "转账凭证")];
  const url = preview ? `/api/personnel/insurance-file?${new URLSearchParams({ id: String(preview.id), field: preview.field })}` : "";
  return <><Button size="small" onClick={() => { setLoading(true); setOpen(true); }}>历史明细</Button><Drawer title={`${name}的历史明细`} open={open} onClose={() => { setOpen(false); setPreview(null); }} width="min(1100px, 100vw)" destroyOnHidden>
    <Tabs activeKey={kind} onChange={(value) => { setLoading(true); setPage(1); setMonth(""); setDraft(""); setKind(value as Kind); }} items={[...(can("staff_salarydetail") ? [{ key: "salary", label: "工资条" }] : []), ...(can("staff_insurancedetail") ? [{ key: "insurance", label: "社保明细" }] : [])]} />
    <Space wrap style={{ marginBottom: 16 }}><span>月份</span><DatePicker picker="month" format="YYYY-MM" placeholder="选择月份" value={draft ? dayjs(`${draft}-01`) : null} onChange={(value) => setDraft(value ? value.format("YYYY-MM") : "")} /><Button type="primary" onClick={() => { setLoading(true); setPage(1); if (month === draft && page === 1) setLoading(false); else setMonth(draft); }}>查询</Button><Button onClick={() => { setDraft(""); setPage(1); if (month !== "" || page !== 1) { setLoading(true); setMonth(""); } }}>重置</Button></Space>
    {error && <Alert type="error" showIcon message={error} />}
    <Table<Row> rowKey="id" columns={columns} dataSource={data.items} loading={loading} scroll={{ x: 1000 }} pagination={{ current: page, pageSize, total: data.total, showSizeChanger: true, pageSizeOptions: [10, 20, 50], showTotal: (total) => `共 ${total} 条`, onChange: (next, size) => { setLoading(true); setPage(size === pageSize ? next : 1); setPageSize(size); } }} />
    <Drawer title={preview?.label || "凭证预览"} open={!!preview} onClose={() => setPreview(null)} width="min(720px, 100vw)" destroyOnHidden extra={preview && <Button icon={<DownloadOutlined />} href={`${url}&download=1`}>下载</Button>}>{preview && <iframe className="attachment-preview" title={`${preview.label}预览`} src={url} />}</Drawer>
  </Drawer></>;
}
