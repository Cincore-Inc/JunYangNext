import { formatMoney } from "@/lib/money.mjs";

export default function Money({ value, unit = "fen" }: { value: number | null | undefined; unit?: "fen" | "yuan" }) {
  if (value == null) return <>—</>;
  const amount = Number(value);
  if (!Number.isFinite(amount) || (unit === "fen" && !Number.isSafeInteger(amount))) return <>金额异常</>;
  const text = unit === "fen" ? formatMoney(amount) : `¥${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return <span className={amount < 0 ? "money-negative" : amount > 0 ? "money-positive" : "money-neutral"}>{text}</span>;
}
