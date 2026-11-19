"use client";

import { useState } from "react";
import { Button, Drawer, Tabs } from "antd";
import { useAccess } from "./access";
import PersonnelDetails from "./personnel-details";
import ExamPage from "./exam-page";

export default function StaffRecords({ id, name }: { id: number; name: string }) {
  const { can } = useAccess(); const [open, setOpen] = useState(false);
  const items = [
    ...(can("certificate_view") ? [{ key: "certificates", label: "证件信息", children: <PersonnelDetails kind="certificates" staffContext={{ id, name }} /> }] : []),
    ...(can("exam_view") ? [{ key: "exams", label: "考试信息", children: <ExamPage staffContext={{ id, name }} /> }] : []),
  ];
  return <><Button size="small" onClick={() => setOpen(true)}>证件与考试</Button><Drawer title={`${name}的证件与考试`} open={open} onClose={() => setOpen(false)} width="min(1200px, 100vw)" destroyOnHidden><Tabs items={items} /></Drawer></>;
}
