"use client";

import { Button, Drawer, Space } from "antd";
import type { ReactNode } from "react";

export default function FormDrawer({ title, open, onCancel, onOk, confirmLoading, children }: { title: ReactNode; open: boolean; onCancel: () => void; onOk: () => void | Promise<void>; confirmLoading?: boolean; children: ReactNode }) {
  return <Drawer title={title} open={open} onClose={onCancel} width="min(600px, 100vw)" destroyOnHidden footer={<div style={{ textAlign: "right" }}><Space><Button onClick={onCancel}>取消</Button><Button type="primary" loading={confirmLoading} onClick={onOk}>保存</Button></Space></div>}>
    {children}
  </Drawer>;
}
