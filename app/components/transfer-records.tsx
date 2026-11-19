"use client";

import { useEffect, useState } from "react";
import { Alert, App, Button, Drawer, Form, Input, Popconfirm, Space, Table, Upload } from "antd";
import { DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import Money from "./money";
import FormDrawer from "./form-drawer";
import StringDatePicker from "./string-date-picker";
import { useAccess } from "./access";

type Transfer = { id: string; index: number; date: string | null; amount: number; note: string; hasFile: boolean; extension: string };
type Data = { updatedAt: string | null; status: string; items: Transfer[] };
async function json<T>(url: string, options?: RequestInit): Promise<T> { const response = await fetch(url, { ...options, cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "操作失败"); return body; }
const day = (value: string | null) => value ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : "";

export default function TransferRecords({ receiptId, onChanged }: { receiptId: string; onChanged?: () => void }) {
  const { can } = useAccess();
  const { message } = App.useApp(); const [form] = Form.useForm();
  const [open, setOpen] = useState(false); const [data, setData] = useState<Data | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(false); const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<Transfer | "new" | null>(null); const [preview, setPreview] = useState<Transfer | null>(null); const [saving, setSaving] = useState(false);
  useEffect(() => { if (!open) return; const controller = new AbortController(); json<Data>(`/api/finance/transfers?id=${encodeURIComponent(receiptId)}`, { signal: controller.signal }).then(setData).catch((e) => { if (e.name !== "AbortError") setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [open, receiptId, revision]);
  const refresh = () => { setLoading(true); setError(""); setRevision((n) => n + 1); onChanged?.(); };
  const openForm = (row?: Transfer) => { form.resetFields(); form.setFieldsValue({ date: row ? day(row.date) : day(new Date().toISOString()), amount: row ? (row.amount / 100).toFixed(2) : "", note: row?.note || "" }); setEditing(row || "new"); };
  const mutate = async (action: "create" | "edit" | "delete", row?: Transfer) => { const values = action === "delete" ? {} : await form.validateFields(); await json("/api/finance/transfers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, action, receiptId, id: row?.id, updatedAt: data?.updatedAt }) }); };
  const save = async () => { try { setSaving(true); await mutate(editing === "new" ? "create" : "edit", editing === "new" ? undefined : editing || undefined); message.success("转账记录已保存"); setEditing(null); refresh(); } catch (e) { if (e instanceof Error) message.error(e.message); } finally { setSaving(false); } };
  const url = preview ? `/api/attachments?${new URLSearchParams({ kind: "receipts", id: receiptId, field: "transferRecords", transferId: preview.id })}` : "";
  return <><Button size="small" onClick={() => { setLoading(true); setOpen(true); }}>转账记录</Button><Drawer title="转账记录" width="min(850px, 100vw)" open={open} onClose={() => setOpen(false)} destroyOnHidden>
    {error && <Alert type="error" showIcon message={error} />}
    {can("finance_view") && data?.updatedAt && <div className="table-actions"><Button type="primary" onClick={() => openForm()}>新增转账</Button></div>}
    <Table<Transfer> rowKey={(row) => row.id || String(row.index)} loading={loading} dataSource={data?.items || []} scroll={{ x: 650 }} pagination={false} columns={[{ title: "日期", dataIndex: "date", render: (value: string | null) => day(value) || "—" }, { title: "金额", dataIndex: "amount", render: (value: number) => <Money value={value} /> }, { title: "备注", dataIndex: "note", render: (value: string) => value || "—" }, { title: "凭证", render: (_, row) => <Space size={4}>{row.hasFile && row.id && <Button size="small" onClick={() => setPreview(row)}>预览</Button>}{can("project_file_upload") && row.id ? <Upload showUploadList={false} customRequest={async ({ file, onSuccess, onError }) => { try { const body = new FormData(); body.set("id", receiptId); body.set("kind", "receipts"); body.set("field", "transferRecords"); body.set("transferId", row.id); body.set("file", file); if (row.hasFile) body.set("replace", "1"); const result = await json("/api/attachments/upload", { method: "POST", body }); message.success("凭证已上传"); onSuccess?.(result); refresh(); } catch (e) { const error = e instanceof Error ? e : new Error("上传失败"); message.error(error.message); onError?.(error); } }}><Button size="small" icon={<UploadOutlined />}>{row.hasFile ? "更换" : "上传"}</Button></Upload> : !row.hasFile ? "—" : null}</Space> }, { title: "操作", width: 145, fixed: "right", render: (_, row) => can("finance_view") && row.id && <Space size={4}><Button size="small" onClick={() => openForm(row)}>编辑</Button><Popconfirm title="删除这条转账记录？" okText="删除" cancelText="取消" onConfirm={async () => { try { await mutate("delete", row); message.success("已删除"); refresh(); } catch (e) { message.error(e instanceof Error ? e.message : "删除失败"); } }}><Button size="small" danger>删除</Button></Popconfirm></Space> }]} />
    <FormDrawer title={editing === "new" ? "新增转账" : "编辑转账"} open={editing !== null} onCancel={() => setEditing(null)} onOk={save} confirmLoading={saving}><Form form={form} layout="vertical" preserve={false}><Form.Item name="date" label="转账日期"><StringDatePicker style={{ width: "100%" }} /></Form.Item><Form.Item name="amount" label="金额（元）" rules={[{ required: true, pattern: /^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/, message: "请输入最多两位小数的金额" }]}><Input inputMode="decimal" /></Form.Item><Form.Item name="note" label="备注"><Input.TextArea maxLength={500} rows={3} /></Form.Item></Form></FormDrawer>
    <Drawer title="转账凭证" width="min(720px, 100vw)" open={!!preview} onClose={() => setPreview(null)} destroyOnHidden extra={preview && <Button icon={<DownloadOutlined />} href={`${url}&download=1`} target="_blank" rel="noopener noreferrer">下载</Button>}>{preview && (["png", "jpg", "jpeg", "webp", "gif", "pdf"].includes(preview.extension) ? <iframe title="转账凭证预览" className="attachment-preview" src={url} referrerPolicy="no-referrer" /> : <div style={{ padding: 24 }}>该文件可下载后查看。</div>)}</Drawer>
  </Drawer></>;
}
