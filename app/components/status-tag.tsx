import { Tag } from "antd";

const colors: Record<string, string> = {
  "有效": "green", "已抵扣": "cyan", "作废": "red", "未交票": "orange", "过期": "red", "永久": "blue", "存稿": "default",
  "收入": "red", "支出": "green",
  "已对账": "green", "未对账": "orange", "已中标": "green", "投标中": "blue", "未中标": "red",
  "在建": "blue", "完工": "green", "竣工": "cyan", "质保": "purple", "停工": "orange",
  "在职": "green", "离职": "default", "试用": "orange", "兼职": "blue", "启用": "green", "停用": "default",
  "已缴纳": "green", "未缴纳": "orange", "已年审": "green", "待年审": "orange", "未过期": "green", "已过期": "red", "需要年审": "blue", "不年审": "default",
  "考过": "green", "未过": "red", "已领取": "green", "未领取": "orange", "已授权": "green", "未授权": "default",
};
export default function StatusTag({ value }: { value: string | null | undefined }) {
  if (!value || value === "—") return <>—</>;
  return <Tag color={colors[value] || "default"}>{value}</Tag>;
}
