"use client";
import { useState } from "react";
import { App, Button, Drawer, Empty, Input, Popconfirm, Space } from "antd";
import { useAccess } from "./access";

type Category = { id: string; name: string; subCategories: string[] };
export default function FileCategories({ categories, onChanged }: { categories: Category[]; onChanged: () => void }) {
  const { can } = useAccess(); const { message } = App.useApp();
  const [open, setOpen] = useState(false); const [selected, setSelected] = useState(""); const [name, setName] = useState(""); const [sub, setSub] = useState(""); const [busy, setBusy] = useState(false);
  const category = categories.find(item => item.id === selected);
  const send = async (method: "POST" | "PATCH" | "DELETE", data: { id?: string; name?: string }, action = "") => {
    try { setBusy(true); const response = await fetch(`/api/files/categories${action ? `?action=${action}` : ""}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "操作失败"); message.success("分类已更新"); if (method === "POST") { setName(""); setSelected(result.id); } if (method === "PATCH" && action === "add") setSub(""); if (method === "DELETE" && selected === data.id) setSelected(categories.find(item => item.id !== data.id)?.id || ""); onChanged(); } catch (e) { message.error(e instanceof Error ? e.message : "操作失败"); } finally { setBusy(false); }
  };
  if (!can("file_view", "project_file_upload") && !can("file_view", "project_file_delete")) return null;
  return <><Button onClick={() => { if (!categories.some(item => item.id === selected)) setSelected(categories[0]?.id || ""); setOpen(true); }}>管理分类</Button><Drawer title="文件分类管理" width="min(720px, 100vw)" open={open} onClose={() => setOpen(false)} destroyOnHidden>
    <div className="file-categories">
      <section><h3>一级分类</h3>{can("file_view", "project_file_upload") && <Space.Compact style={{ width: "100%" }}><Input aria-label="新分类名称" placeholder="输入分类名称" maxLength={100} value={name} onChange={e => setName(e.target.value)} onPressEnter={() => name.trim() && send("POST", { name })} /><Button loading={busy} onClick={() => name.trim() && send("POST", { name })}>添加</Button></Space.Compact>}
        {categories.map(item => <div className="file-category-row" key={item.id}><Button type={item.id === selected ? "primary" : "text"} onClick={() => setSelected(item.id)}>{item.name}</Button>{can("file_view", "project_file_delete") && <Popconfirm title="确定删除此分类？" description="历史文件不会被删除。" onConfirm={() => send("DELETE", { id: item.id })}><Button danger size="small">删除</Button></Popconfirm>}</div>)}
      </section><section><h3>二级分类{category ? ` · ${category.name}` : ""}</h3>{category ? <>{can("file_view", "project_file_upload") && <Space.Compact style={{ width: "100%" }}><Input aria-label="新子分类名称" placeholder="输入子分类名称" maxLength={100} value={sub} onChange={e => setSub(e.target.value)} onPressEnter={() => sub.trim() && send("PATCH", { id: category.id, name: sub }, "add")} /><Button loading={busy} onClick={() => sub.trim() && send("PATCH", { id: category.id, name: sub }, "add")}>添加</Button></Space.Compact>}{category.subCategories.map(value => <div className="file-category-row" key={value}><span>{value}</span>{can("file_view", "project_file_delete") && <Popconfirm title="确定删除此子分类？" description="历史文件不会被删除。" onConfirm={() => send("PATCH", { id: category.id, name: value }, "remove")}><Button danger size="small">删除</Button></Popconfirm>}</div>)}</> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择一级分类" />}</section>
    </div></Drawer></>;
}
