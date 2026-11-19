export const transactionFields = ["name", "accountName", "channel", "oppositeName", "oppositeAccountName", "oppositeChannel", "note", "todo"] as const;
export function financeDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === "" || value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("日期无效");
  const parsed = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(parsed.getTime()) || new Date(parsed.getTime() + 28800000).toISOString().slice(0, 10) !== value) throw new Error("日期无效");
  return parsed;
}
export function transactionExtra(body: Record<string, unknown>) {
  const result: Record<string, string> = {};
  for (const key of transactionFields) {
    const value = body[key];
    if (value !== undefined && (typeof value !== "string" || value.length > 500)) return null;
    if (typeof value === "string") result[key] = value.trim();
  }
  return result;
}

export function invoiceExtra(body: Record<string, unknown>, kind: "receipts" | "invoices") {
  const result: Record<string, string | Date | null> = {};
  const strings = kind === "receipts" ? ["person", "receiptType", "tags", "purpose", "title", "note", "todo", "storagePlace"] : ["tags", "taxCode", "note", "todo"];
  const dates = kind === "receipts" ? ["issueDate", "deductDate", "submitDate"] : ["deductDate", "submitDate"];
  for (const key of strings) {
    const value = body[key];
    if (value !== undefined && (typeof value !== "string" || value.length > 500)) return null;
    if (typeof value === "string") result[key] = value.trim();
  }
  for (const key of dates) {
    const value = body[key];
    if (value === undefined) continue;
    if (value === "" || value === null) { result[key] = null; continue; }
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parsed = new Date(`${value}T00:00:00+08:00`);
    if (Number.isNaN(parsed.getTime()) || new Date(parsed.getTime() + 8 * 3600000).toISOString().slice(0, 10) !== value) return null;
    result[key] = parsed;
  }
  return result;
}
