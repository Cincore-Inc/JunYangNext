import type { Document } from "mongodb";

const names: Record<string, string> = { receipts: "发票", invoices: "发票", otherFiles: "其他资料", contract: "合同", license: "营业执照", ownerId: "法人身份证", bankCertificate: "开户许可证", receipt: "凭证", callerFiles: "招标文件", bidderFiles: "投标文件", winnerNotifications: "中标通知书", constructionContracts: "施工合同", jobContracts: "劳务合同", completeVerifications: "竣工验收资料" };

export function attachmentFilename(path: string): string | undefined {
  const match = /^(?:projects|receipts|invoices|transactions)\/[0-9a-f-]{36}\/([A-Za-z0-9_-]+)\.[a-z0-9]+$/i.exec(path);
  if (!match) return undefined;
  const name = Buffer.from(match[1], "base64url").toString("utf8");
  return name && name.length <= 255 && !/[\x00-\x1f\x7f/\\]/.test(name) ? name : undefined;
}

export function attachmentRefs(row: Document, fields: string[]) {
  return fields.flatMap((field) => {
    const value = row[field];
    const values = Array.isArray(value) ? value : [value];
    return values.flatMap((path, index) => typeof path === "string" && path ? [{ field, index, extension: path.split(".").pop()?.toLowerCase() || "", label: attachmentFilename(path) || `${names[field]}${values.length > 1 ? ` ${index + 1}` : ""}` }] : []);
  });
}
