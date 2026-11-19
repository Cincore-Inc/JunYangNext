"use client";

import { Button, Drawer, Space } from "antd";
import type { ReactNode } from "react";

export default function FormDrawer({ title, open, inline, onCancel, onOk, confirmLoading, children }: { title: ReactNode; open: boolean; inline?: boolean; onCancel: () => void; onOk: () => void | Promise<void>; confirmLoading?: boolean; children: ReactNode }) {
  if (inline) return <section className="inline-editor" aria-label={typeof title === "string" ? title : undefined}><h3>{title}</h3>{children}<div className="inline-editor-actions"><Space><Button onClick={onCancel}>取消</Button><Button type="primary" loading={confirmLoading} onClick={onOk}>保存</Button></Space></div></section>;
  return <Drawer title={title} open={open} onClose={onCancel} width="min(600px, 100vw)" destroyOnHidden footer={<div style={{ textAlign: "right" }}><Space><Button onClick={onCancel}>取消</Button><Button type="primary" loading={confirmLoading} onClick={onOk}>保存</Button></Space></div>}>
    {children}
  </Drawer>;
}
