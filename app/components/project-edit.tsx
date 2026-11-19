"use client";

import { App, Button, DatePicker, Descriptions, Form, Input, InputNumber, Select, Space } from "antd";
import type { DescriptionsProps } from "antd";
import dayjs from "dayjs";
import { Children, cloneElement, isValidElement, useState, type ReactElement } from "react";

type ProjectValues = { name: string; updatedAt: string | null; address: string; phone: string; lastEditedBy: string; bidMethod: string; bidStatus: string; bidAddress: string; caller: string; callerContact: string; callerPhone: string; callerBank: string; callerBankAccount: string; winnerOther: string; projectType: string; status: string; description: string; notes: string; todo: string; fileNote: string; taxDeductRatio: string; materialRatio: string; laborRatio: string; bidders: string[]; bids: string[]; tags: string[]; bidLimit: number | null; winnerPrice: number | null; managementFee: number | null; tax: number | null; bidStartTime: string | null; projectStart: string | null; projectEnd: string | null; requireOriginalFiles: boolean | null; number: number | null; winner: { value?: string; label?: string } | string | null };
const dates = ["bidStartTime", "projectStart", "projectEnd"] as const;

export default function ProjectEdit({ id, project, items, onSaved }: { id: string; project: ProjectValues; items: NonNullable<DescriptionsProps["items"]>; onSaved: () => void }) {
  const [form] = Form.useForm(); const { message } = App.useApp(); const [editing, setEditing] = useState(false); const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState<{ value: string; label: string }[]>([]); const [winnerChanged, setWinnerChanged] = useState(false);
  const findCompanies = async (q: string) => { try { const response = await fetch(`/api/projects/options?${new URLSearchParams({ q })}`); const result = await response.json(); if (!response.ok) throw new Error(result.error); setCompanies(result.items); } catch (error) { message.error(error instanceof Error ? error.message : "读取公司失败"); } };
  const start = () => { setWinnerChanged(false); form.setFieldsValue({ ...project, status: project.status === "未设置" ? "" : project.status, projectNumber: project.number, winner: typeof project.winner === "object" && project.winner?.value ? project.winner : null, ...Object.fromEntries(dates.map((key) => [key, project[key] ? dayjs(project[key]) : null])) }); void findCompanies(""); setEditing(true); };
  const save = async () => {
    try {
      const values = await form.validateFields(); setSaving(true);
      const { winner, ...otherValues } = values;
      const payload = { ...Object.fromEntries(Object.entries(otherValues).map(([key, value]) => [key, value ?? ""])), ...Object.fromEntries(["bidLimit", "winnerPrice", "managementFee", "tax"].map((key) => [key, values[key] ?? null])), ...(winnerChanged ? { winner: winner?.value ? winner : null } : {}), projectNumber: values.projectNumber ?? null, requireOriginalFiles: values.requireOriginalFiles ?? null, ...Object.fromEntries(dates.map((key) => [key, values[key] ? values[key].toISOString() : null])), updatedAt: project.updatedAt };
      const response = await fetch(`/api/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "保存失败"); message.success("项目已更新"); setEditing(false); onSaved();
    } catch (error) { if (error instanceof Error) message.error(error.message); } finally { setSaving(false); }
  };
  const fields = <>
      {([['name','工程名称'], ['address','工程地址'], ['phone','联系方式'], ['lastEditedBy','编辑人'], ['bidAddress','开标地点'], ['caller','招标单位'], ['callerContact','招标联系人'], ['callerPhone','招标联系方式'], ['callerBank','招标开户行'], ['callerBankAccount','招标银行账户'], ['winnerOther','其他中标公司'], ['taxDeductRatio','抵增税比'], ['materialRatio','材料票比'], ['laborRatio','劳务票比']] as const).map(([name,label]) => <Form.Item key={name} name={name} label={label} rules={name === "name" ? [{ required: true, whitespace: true }] : []}><Input maxLength={200} /></Form.Item>)}
      {([['bidders','投标人'], ['bids','报价'], ['tags','项目标签']] as const).map(([name,label]) => <Form.Item key={name} name={name} label={label}><Select mode="tags" tokenSeparators={["，", ","]} /></Form.Item>)}
      {([['bidMethod','投标方式',['低价中标','邀标低价','库内低价','抽选','电子标','综合评选']], ['bidStatus','中标状态',['未中标','投标中','已中标']], ['status','项目状态',['在建','竣工','质保','完工','停工','作废']], ['projectType','项目类型',['管理','合伙','代记','自建']]] as const).map(([name,label,values]) => <Form.Item key={name} name={name} label={label}><Select allowClear options={values.map((value) => ({ value, label: value }))} /></Form.Item>)}
      <Form.Item name="winner" label="中标公司" extra={typeof project.winner === "string" && project.winner && !winnerChanged ? <span>历史记录：{project.winner} <Button size="small" onClick={() => { form.setFieldValue("winner", null); setWinnerChanged(true); }}>清除</Button></span> : undefined}><Select allowClear showSearch labelInValue filterOption={false} onSearch={findCompanies} onChange={() => setWinnerChanged(true)} options={companies} /></Form.Item>
      <Form.Item name="requireOriginalFiles" label="原件要求"><Select allowClear options={[{ value:true,label:'是' }, { value:false,label:'否' }]} /></Form.Item>
      {([['projectNumber','项目编号'], ['bidLimit','最高限价（元）'], ['winnerPrice','中标价（元）'], ['managementFee','管理费（%）'], ['tax','税费（%）']] as const).map(([name,label]) => <Form.Item name={name} label={label} key={name}><InputNumber min={0} max={1000000000000} precision={0} style={{ width:'100%' }} /></Form.Item>)}
      {([['bidStartTime','开标时间'], ['projectStart','工期开始'], ['projectEnd','工期结束']] as const).map(([name,label]) => <Form.Item name={name} label={label} key={name}><DatePicker showTime={name === 'bidStartTime'} style={{ width:'100%' }} /></Form.Item>)}
      {([['description','工程内容'], ['notes','备注'], ['todo','待办'], ['fileNote','文件备注']] as const).map(([name,label]) => <Form.Item className="project-inline-edit-wide" key={name} name={name} label={label}><Input.TextArea maxLength={name === 'notes' ? 10000 : 2000} rows={3} /></Form.Item>)}
  </>;
  const controls = new Map(Children.toArray(fields.props.children).flatMap((field) =>
    isValidElement<{ name: string; label: string; children: ReactElement<{ "aria-label"?: string }> }>(field)
      ? [[field.props.name, cloneElement(field, { label: undefined }, cloneElement(field.props.children, { "aria-label": field.props.label }))] as const] : []));
  const aliases: Record<string, string> = { number: "projectNumber", method: "bidMethod", bidTime: "bidStartTime", limit: "bidLimit", original: "requireOriginalFiles", price: "winnerPrice", type: "projectType", editor: "lastEditedBy", callerAccount: "callerBankAccount", taxRatio: "taxDeductRatio" };
  const displayItems = [{ key: "name", label: "工程名称", span: "filled" as const, children: project.name }, ...items];
  return <Form form={form} preserve={false} className="project-info-editor">
    <div className="table-actions">{editing ? <Space><Button disabled={saving} onClick={() => setEditing(false)}>取消</Button><Button type="primary" loading={saving} onClick={save}>保存</Button></Space> : <Button onClick={start}>编辑项目信息</Button>}</div>
    <Descriptions className="project-info" size="small" bordered column={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }} items={displayItems.map((item) => ({
      ...item,
      children: !editing ? item.children : item.key === "period"
        ? <Space style={{ width: "100%" }}>{controls.get("projectStart")}<span>至</span>{controls.get("projectEnd")}</Space>
        : controls.get(aliases[String(item.key)] || String(item.key)) || item.children,
    }))} />
  </Form>;
}
