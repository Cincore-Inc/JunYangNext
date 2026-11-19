"use client";
import { App, Button, Form, Input, Table } from "antd";
import { useState } from "react";
import Money from "./money";
import FormDrawer from "./form-drawer";
import StringDatePicker from "./string-date-picker";

type Company = { _id?: string; name?: string; staff?: string; docFee?: number; commission?: number; applicationFee?: number; deposit?: number; depositRefundDate?: string | null; creditReportFee?: number; letterFee?: number; showPerson?: string; showFee?: number; otherFee?: number; note?: string };
const day = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : "";
const fees = [['docFee','资料费'], ['commission','提成'], ['applicationFee','报名费'], ['deposit','投标保证金'], ['creditReportFee','信用报告费'], ['letterFee','保函费'], ['showFee','出场费'], ['otherFee','其他费用']] as const;
export default function ProjectCompanies({ id, version, companies, onSaved }: { id: string; version: string | null; companies: Company[]; onSaved: () => void }) {
  const [form] = Form.useForm(); const { message } = App.useApp();
  const [editing, setEditing] = useState<number | "new" | null>(null); const [saving, setSaving] = useState(false);
  const open = (index: number | "new") => { const row = index === "new" ? {} : companies[index]; form.resetFields(); form.setFieldsValue({ ...row, name: row.name || "", staff: row.staff || "", showPerson: row.showPerson || "", note: row.note || "", depositRefundDate: day(row.depositRefundDate), ...Object.fromEntries(fees.map(([field]) => [field, (Number(row[field] || 0) / 100).toFixed(2)])) }); setEditing(index); };
  const save = async () => { try { const values = await form.validateFields(); setSaving(true); const response = await fetch(`/api/projects/${id}/companies`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, index: editing === "new" ? null : editing, updatedAt: version }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "保存失败"); message.success("投标公司已保存"); setEditing(null); onSaved(); } catch (error) { if (error instanceof Error) message.error(error.message); } finally { setSaving(false); } };
  return <><div className="table-actions"><Button type="primary" onClick={() => open("new")}>新增投标公司</Button></div><Table<Company> rowKey={(_row, index) => String(index)} dataSource={companies} pagination={false} scroll={{ x: 1800 }} columns={[
    { title: "投标公司", dataIndex: "name", width: 180 }, { title: "资料员", dataIndex: "staff", width: 120 }, ...fees.map(([dataIndex, title]) => ({ title, dataIndex, width: 130, render: (value: number | null) => <Money value={value} /> })), { title: "保证金预计退还日期", dataIndex: "depositRefundDate", width: 170, render: (value: string | null) => day(value) || "—" }, { title: "出场人", dataIndex: "showPerson", width: 120 }, { title: "备注", dataIndex: "note", width: 240, render: (value: string) => value ? <span className="table-note" title={value}>{value}</span> : "—" }, { title: "操作", width: 90, fixed: "right", render: (_, _row, index) => <Button size="small" onClick={() => open(index)}>编辑</Button> },
  ]} /><FormDrawer title={editing === "new" ? "新增投标公司" : "编辑投标公司"} open={editing !== null} onCancel={() => setEditing(null)} onOk={save} confirmLoading={saving}><Form form={form} layout="vertical" preserve={false}>
    {([['name','投标公司'], ['staff','资料员'], ['showPerson','出场人']] as const).map(([name,label]) => <Form.Item name={name} label={label} key={name} rules={name === 'name' ? [{ required: true, whitespace: true }] : []}><Input maxLength={200} /></Form.Item>)}
    {fees.map(([name,label]) => <Form.Item name={name} label={`${label}（元）`} key={name} rules={[{ required: true, pattern: /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/, message: '请输入最多两位小数的金额' }]}><Input inputMode="decimal" /></Form.Item>)}
    <Form.Item name="depositRefundDate" label="保证金预计退还日期"><StringDatePicker style={{ width: "100%" }} /></Form.Item><Form.Item name="note" label="备注"><Input.TextArea maxLength={500} rows={3} /></Form.Item>
  </Form></FormDrawer></>;
}
