"use client";

import { useRef, useState } from "react";
import { App, Button, Form, Input, Popconfirm, Select, Space } from "antd";
import dayjs from "dayjs";
import FormDrawer from "./form-drawer";
import StringDatePicker from "./string-date-picker";
import { useAccess } from "./access";

export type EditableFile = { id: string; filename: string; type: string; subtype: string; owner: string; associates: string[]; tags: string[]; note: string; effectiveFrom: string | null; expiresAt: string | null; needRenew: boolean | null; status: string; updatedAt: string | null };
type Option = { value: string; label: string };
type Category = { name: string; subCategories: string[] };

export default function FileEditor({ file, categories, tags, onChanged }: { file: EditableFile; categories: Category[]; tags: string[]; onChanged: () => void }) {
  const { can } = useAccess();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [people, setPeople] = useState<Option[]>([]);
  const initial = useRef<Record<string, unknown>>({});
  const selectedType = Form.useWatch("type", form);
  const searchCounter = useRef(0);
  const fetchPeople = async (query: string, ids = false) => {
    const current = ++searchCounter.current;
    try {
      const response = await fetch(`/api/files/options?${new URLSearchParams({ [ids ? "ids" : "people"]: query })}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "无法读取关联选项");
      if (current === searchCounter.current) setPeople(previous => [...new Map([...previous, ...body.items].map((option: Option) => [option.value, option])).values()] as Option[]);
    } catch (e) { if (current === searchCounter.current) message.error(e instanceof Error ? e.message : "无法读取关联选项"); }
  };
  const show = () => {
    const values = { filename: file.filename, type: file.type, subtype: file.subtype, owner: file.owner || undefined, associates: file.associates, tags: file.tags, note: file.note, effectiveFrom: file.effectiveFrom ? dayjs(file.effectiveFrom).format("YYYY-MM-DD") : "", expiresAt: file.expiresAt ? dayjs(file.expiresAt).format("YYYY-MM-DD") : "", needRenew: file.needRenew, status: file.status };
    initial.current = values; form.setFieldsValue(values); setOpen(true);
    const ids = [...new Set([file.owner, ...file.associates].filter(v => /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(v)))];
    if (ids.length) void fetchPeople(ids.slice(0, 60).join(","), true);
  };
  const send = async (method: "PATCH" | "DELETE") => {
    try {
      const values = method === "PATCH" ? await form.validateFields() : {};
      const changes = Object.fromEntries(Object.entries(values).filter(([key, value]) => JSON.stringify(value ?? "") !== JSON.stringify(initial.current[key] ?? "")));
      if (method === "PATCH" && !Object.keys(changes).length) { setOpen(false); return; }
      for (const key of ["owner", "type", "subtype", "status"]) if (key in changes && changes[key] == null) changes[key] = "";
      if ("needRenew" in changes && changes.needRenew == null) changes.needRenew = null;
      setSaving(true);
      const response = await fetch("/api/files", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: file.id, updatedAt: file.updatedAt, changes }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "操作失败");
      message.success(method === "PATCH" ? "文件信息已保存" : "文件已删除"); setOpen(false); onChanged();
    } catch (e) { if (e instanceof Error) message.error(e.message); } finally { setSaving(false); }
  };
  if (!can("file_view", "project_file_upload") && !can("file_view", "project_file_delete")) return null;
  const options = [...new Map([...people, ...[file.owner, ...file.associates].filter(Boolean).map(value => ({ value, label: value }))].reverse().map(option => [option.value, option])).values()];
  return <><Space size={4}>
    {can("file_view", "project_file_upload") && <Button size="small" onClick={show}>编辑</Button>}
    {can("file_view", "project_file_delete") && <Popconfirm title="确定删除此文件？" description="文件记录将保留，列表中不再显示。" onConfirm={() => send("DELETE")}><Button size="small" danger loading={saving}>删除</Button></Popconfirm>}
  </Space><FormDrawer title="编辑文件" open={open} onCancel={() => setOpen(false)} onOk={() => send("PATCH")} confirmLoading={saving}><Form form={form} layout="vertical">
    <Form.Item name="filename" label="文件名称" rules={[{ required: true, whitespace: true }]}><Input maxLength={255} /></Form.Item>
    <Form.Item name="type" label="分类"><Select allowClear options={categories.map(c => ({ value: c.name, label: c.name }))} onChange={() => form.setFieldValue("subtype", "")} /></Form.Item>
    <Form.Item name="subtype" label="子分类"><Select allowClear options={(categories.find(c => c.name === selectedType)?.subCategories || []).map(value => ({ value, label: value }))} /></Form.Item>
    <Form.Item name="owner" label="归属"><Select allowClear showSearch filterOption={false} onFocus={() => fetchPeople("")} onSearch={fetchPeople} options={options} placeholder="搜索人员或公司" /></Form.Item>
    <Form.Item name="associates" label="关联"><Select mode="multiple" showSearch filterOption={false} onFocus={() => fetchPeople("")} onSearch={fetchPeople} options={options} placeholder="搜索人员或公司" /></Form.Item>
    <Form.Item name="tags" label="标签"><Select mode="tags" maxCount={30} options={tags.map(value => ({ value, label: value }))} /></Form.Item>
    <Form.Item name="note" label="备注"><Input.TextArea maxLength={2000} rows={3} /></Form.Item>
    <Form.Item name="effectiveFrom" label="生效日期"><StringDatePicker style={{ width: "100%" }} /></Form.Item>
    <Form.Item name="expiresAt" label="到期日期"><StringDatePicker style={{ width: "100%" }} /></Form.Item>
    <Form.Item name="needRenew" label="年审"><Select allowClear options={[{ value: true, label: "需要" }, { value: false, label: "不需要" }]} /></Form.Item>
    <Form.Item name="status" label="状态"><Select allowClear options={["有效", "过期", "永久", "存稿"].map(value => ({ value, label: value }))} /></Form.Item>
  </Form></FormDrawer></>;
}
