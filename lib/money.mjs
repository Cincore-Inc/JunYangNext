export function formatMoney(fen) {
  if (!Number.isSafeInteger(fen)) return "金额异常";
  const negative = fen < 0 ? "-" : "";
  const absolute = Math.abs(fen);
  return `${negative}¥${Math.floor(absolute / 100).toLocaleString("zh-CN")}.${String(absolute % 100).padStart(2, "0")}`;
}

export function parseMoney(value) {
  if (typeof value !== "string" || !/^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(value)) return null;
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? (negative ? -cents : cents) : null;
}
