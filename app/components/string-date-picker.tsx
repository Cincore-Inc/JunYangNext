"use client";

import { DatePicker } from "antd";
import dayjs from "dayjs";
import type { CSSProperties } from "react";

export default function StringDatePicker({ value, onChange, id, showTime = false, style }: { value?: string | null; onChange?: (value: string) => void; id?: string; showTime?: boolean; style?: CSSProperties }) {
  const parsed = value ? dayjs(value) : null;
  return <DatePicker id={id} style={style} value={parsed?.isValid() ? parsed : null} showTime={showTime ? { format: "HH:mm" } : false} format={showTime ? "YYYY-MM-DD HH:mm" : "YYYY-MM-DD"} placeholder={showTime ? "选择日期和时间" : "选择日期"} onChange={(date) => onChange?.(date ? date.format(showTime ? "YYYY-MM-DDTHH:mm" : "YYYY-MM-DD") : "")} />;
}
