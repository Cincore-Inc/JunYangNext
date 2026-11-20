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

export function projectInvoiceDifference(issued, receivedCost) {
  if (!Number.isSafeInteger(issued) || !Number.isSafeInteger(receivedCost)) return NaN;
  // 金额以分存储，使用整数运算并在最终差额上四舍五入，避免浮点误差。
  const numerator = BigInt(issued) * 92n - BigInt(receivedCost) * 100n;
  const rounded = numerator < 0n ? -((-numerator + 50n) / 100n) : (numerator + 50n) / 100n;
  const result = Number(rounded);
  return Number.isSafeInteger(result) ? result : NaN;
}
