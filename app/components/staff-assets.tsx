"use client";
import { useEffect, useState } from "react";
import { useAccess } from "./access";
import { Alert, App, Button, Descriptions, Drawer, Image, Input, Popconfirm, Space, Tabs, Upload } from "antd";
import { DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import Money from "./money";
import StatusTag from "./status-tag";

type Kind = "staff" | "itemlist";
type Assets = { images: { id: number }[]; item: string | null };
type StaffInfo = { name: string | null; phone: string | null; position: string | null; entrydate: string | null; staff_status: string | null; salary?: number | null; percentage?: number | null };
const staffStatuses: Record<string, string> = { ON: "在职", OFF: "离职", "ON-TRY": "试用", "ON-HALF": "兼职" };
async function json<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, { ...init, cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "操作失败"); return body; }

export default function StaffAssets({ staff, name }: { staff: number; name: string }) {
  const { can } = useAccess();
  const canViewInfo = can("staff_staff");
  const { message } = App.useApp(); const [open, setOpen] = useState(false); const [kind, setKind] = useState<Kind>("staff"); const [assets, setAssets] = useState<Assets | null>(null); const [item, setItem] = useState(""); const [error, setError] = useState(""); const [revision, setRevision] = useState(0); const [saving, setSaving] = useState(false); const [preview, setPreview] = useState<number | null>(null);
  const [info, setInfo] = useState<StaffInfo | null>(null); const [infoError, setInfoError] = useState("");
  useEffect(() => { if (!open) return; const controller = new AbortController(); json<Assets>(`/api/personnel/staff-assets?${new URLSearchParams({ staff: String(staff), kind })}`, { signal: controller.signal }).then((data) => { setAssets(data); setItem(data.item || ""); setError(""); }).catch((e) => { if (e.name !== "AbortError") setError(e.message); }); return () => controller.abort(); }, [open, staff, kind, revision]);
  useEffect(() => { if (!open || !canViewInfo) return; const controller = new AbortController(); json<StaffInfo>(`/api/staff/write?id=${staff}`, { signal: controller.signal }).then((data) => { setInfo(data); setInfoError(""); }).catch((e) => { if (e.name !== "AbortError") { setInfo(null); setInfoError(e.message); } }); return () => controller.abort(); }, [open, staff, canViewInfo]);
  const refresh = () => { setAssets(null); setError(""); setRevision((n) => n + 1); };
  const remove = async (id: number) => { try { await json(`/api/personnel/staff-assets?${new URLSearchParams({ staff: String(staff), kind, id: String(id) })}`, { method: "DELETE" }); message.success("图片已删除"); if (preview === id) setPreview(null); refresh(); } catch (e) { message.error(e instanceof Error ? e.message : "删除失败"); } };
  const params = new URLSearchParams({ staff: String(staff), kind, id: String(preview || "") }); const url = `/api/personnel/staff-image?${params}`;
  return <><Button size="small" onClick={() => { setAssets(null); setInfo(null); setInfoError(""); setError(""); setKind(can("staff_staff") ? "staff" : "itemlist"); setOpen(true); }}>资料</Button><Drawer title={`${name}的人员资料`} open={open} onClose={() => setOpen(false)} width="min(720px, 100vw)" destroyOnHidden><Tabs activeKey={kind} onChange={(value) => { setAssets(null); setError(""); setKind(value as Kind); }} items={[...(can("staff_staff") ? [{ key: "staff", label: "基本信息" }] : []), ...(can("staff_item") ? [{ key: "itemlist", label: "物品清单" }] : [])]} />
    {error && <Alert type="error" showIcon message={error} />}
    {kind === "staff" && infoError && <Alert type="error" showIcon message={infoError} />}
    {kind === "staff" && info && <Descriptions title="基本信息" column={{ xs: 1, sm: 2 }} size="small" style={{ marginBottom: 20 }} items={[
      { key: "name", label: "员工姓名", children: info.name || "—" }, { key: "phone", label: "联系方式", children: info.phone || "—" },
      { key: "entrydate", label: "入职时间", children: info.entrydate || "—" }, { key: "position", label: "员工职位", children: info.position || "—" },
      { key: "status", label: "员工状态", children: <StatusTag value={info.staff_status ? staffStatuses[info.staff_status] || info.staff_status : null} /> },
      ...(Object.hasOwn(info, "salary") ? [{ key: "salary", label: "固定工资", children: <Money value={info.salary ?? null} unit="yuan" /> }, { key: "percentage", label: "资料费提成比例", children: info.percentage == null ? "—" : `${info.percentage}%` }] : []),
    ]} />}
    {kind === "itemlist" && assets && <div className="staff-items"><label htmlFor="staff-items">物品清单</label><Input.TextArea id="staff-items" value={item} onChange={(e) => setItem(e.target.value)} maxLength={300} rows={4} showCount /><div className="table-actions"><Button type="primary" loading={saving} onClick={async () => { try { setSaving(true); await json("/api/personnel/staff-assets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ staff, item, expected: assets.item }) }); message.success("物品清单已保存"); refresh(); } catch (e) { message.error(e instanceof Error ? e.message : "保存失败"); } finally { setSaving(false); } }}>保存清单</Button></div></div>}
    <Space wrap align="start"><Upload accept="image/png,image/jpeg,image/gif,image/webp" showUploadList={false} customRequest={async ({ file, onSuccess, onError }) => { try { const body = new FormData(); body.set("staff", String(staff)); body.set("kind", kind); body.set("file", file); const result = await json("/api/personnel/staff-assets", { method: "POST", body }); message.success("图片已上传"); onSuccess?.(result); refresh(); } catch (e) { const failure = e instanceof Error ? e : new Error("上传失败"); message.error(failure.message); onError?.(failure); } }}><Button icon={<UploadOutlined />}>上传图片</Button></Upload>{assets?.images.map((image, index) => <Space key={image.id} direction="vertical" size={4} align="center"><button type="button" className="file-thumbnail" aria-label={`预览图片 ${index + 1}`} onClick={() => setPreview(image.id)}><Image preview={false} alt="" src={`/api/personnel/staff-image?${new URLSearchParams({ staff: String(staff), kind, id: String(image.id) })}`} /></button><Popconfirm title="确定删除这张图片？" onConfirm={() => remove(image.id)}><Button size="small" danger>删除</Button></Popconfirm></Space>)}</Space>
    <Drawer title="图片预览" open={preview !== null} onClose={() => setPreview(null)} width="min(720px, 100vw)" destroyOnHidden extra={preview && <Button icon={<DownloadOutlined />} href={`${url}&download=1`}>下载</Button>}>{preview && <iframe className="attachment-preview" title="人员图片预览" src={url} />}</Drawer>
  </Drawer></>;
}
