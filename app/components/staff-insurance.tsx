"use client";

import { useState } from "react";
import { Alert, App, Button, Drawer, Form, InputNumber, Select } from "antd";
import { useAccess } from "./access";

type Settings = { insure_pay: string | null; company_pay: number | null; persenal_pay: number | null; persenal_pay_D: number | null };
const amounts = [["company_pay", "公司应缴（元）"], ["persenal_pay", "个人应缴（转账）（元）"], ["persenal_pay_D", "个人应缴（代扣）（元）"]] as const;
async function json<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, { ...init, cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "操作失败"); return data; }

export default function StaffInsurance({ id, name, onUpdated }: { id: number; name: string; onUpdated: () => void }) {
  const { can } = useAccess(); const { message } = App.useApp(); const [form] = Form.useForm();
  const [open, setOpen] = useState(false); const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [original, setOriginal] = useState<Settings | null>(null);
  const show = async () => {
    setOpen(true); setLoading(true); setError(""); setOriginal(null); form.resetFields();
    try { const data = await json<Settings>(`/api/staff/insurance?id=${id}`); setOriginal(data); form.setFieldsValue({ ...data, ...Object.fromEntries(amounts.map(([field]) => [field, data[field] == null ? null : String(data[field])])) }); }
    catch (e) { setError(e instanceof Error ? e.message : "无法读取社保设置"); } finally { setLoading(false); }
  };
  const save = async () => {
    try {
      const values = await form.validateFields(); setSaving(true);
      await json("/api/staff/insurance", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...values, expected: original }) });
      message.success("社保设置已保存"); setOpen(false); onUpdated();
    } catch (e) { if (e instanceof Error) message.error(e.message); } finally { setSaving(false); }
  };
  return <><Button size="small" onClick={show}>社保设置</Button><Drawer title={`${name}的社保设置`} open={open} onClose={() => setOpen(false)} width="min(520px, 100vw)" loading={loading} destroyOnHidden extra={can("staff_insurancedetail_change") && <Button type="primary" onClick={save} loading={saving} disabled={!original}>保存</Button>}>
    {error && <Alert type="error" showIcon message={error} />}
    {original && <Form form={form} layout="vertical" disabled={!can("staff_insurancedetail_change")}><Form.Item name="insure_pay" label="缴纳方式" normalize={(value) => value ?? null}><Select allowClear placeholder="未设置" options={[{ value: "FULL", label: "公司全缴" }, { value: "NULL", label: "个人全缴" }, { value: "HALF", label: "公司部分缴纳" }, { value: "HALF-D", label: "公司代扣代缴" }]} /></Form.Item>{amounts.map(([field, label]) => <Form.Item key={field} name={field} label={label}><InputNumber stringMode min={0} max={1000000000} precision={2} style={{ width: "100%" }} /></Form.Item>)}</Form>}
  </Drawer></>;
}
