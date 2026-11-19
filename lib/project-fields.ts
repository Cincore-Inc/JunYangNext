import { Long } from "mongodb";

export const projectTexts = ["name", "address", "phone", "lastEditedBy", "bidMethod", "bidStatus", "bidAddress", "caller", "callerContact", "callerPhone", "callerBank", "callerBankAccount", "winnerOther", "projectType", "taxDeductRatio", "materialRatio", "laborRatio", "description", "notes", "todo", "fileNote"] as const;
export const projectArrays = ["bidders", "bids", "tags"] as const;
export const projectMoney = ["bidLimit", "winnerPrice", "managementFee", "tax"] as const;
export const projectDates = ["bidStartTime", "projectStart", "projectEnd"] as const;
export function projectUpdate(body: Record<string, unknown>) {
  const values: Record<string, unknown> = {};
  for (const key of projectTexts) {
    const value = body[key]; if (typeof value !== "string" || value.length > (key === "notes" ? 10000 : ["description", "todo", "fileNote"].includes(key) ? 2000 : 200) || (key === "name" && !value.trim())) throw new Error("请正确填写项目资料"); values[key] = value.trim();
  }
  for (const key of projectArrays) {
    const value = body[key]; if (!Array.isArray(value) || value.length > 100 || value.some((v) => typeof v !== "string" || !v.trim() || v.length > 200)) throw new Error("项目列表字段无效"); values[key] = value.map((v) => v.trim());
  }
  for (const key of projectMoney) {
    const value = body[key]; if (value === null) { values[key] = null; continue; } if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 1000000000000) throw new Error("项目金额必须是非负整数"); values[key] = Long.fromNumber(value);
  }
  for (const key of projectDates) {
    const value = body[key]; if (value === "" || value === null) { values[key] = null; continue; } if (typeof value !== "string") throw new Error("项目日期无效"); const parsed = new Date(value); if (Number.isNaN(parsed.getTime())) throw new Error("项目日期无效"); values[key] = parsed;
  }
  if (body.requireOriginalFiles !== null && typeof body.requireOriginalFiles !== "boolean") throw new Error("原件要求无效"); values.requireOriginalFiles = body.requireOriginalFiles;
  if (body.projectNumber !== null && (!Number.isSafeInteger(body.projectNumber) || Number(body.projectNumber) < 0)) throw new Error("项目编号无效"); values.projectNumber = body.projectNumber;
  if (typeof body.status !== "string" || (body.status && !["在建", "竣工", "质保", "完工", "停工", "作废"].includes(body.status))) throw new Error("项目状态无效"); values.projectStatus = body.status;
  if (body.winner !== undefined) { if (body.winner !== null && (!body.winner || typeof body.winner !== "object" || typeof (body.winner as Record<string, unknown>).value !== "string" || typeof (body.winner as Record<string, unknown>).label !== "string" || !/^[a-f\d-]{36}$/i.test((body.winner as Record<string, string>).value) || (body.winner as Record<string, string>).label.length > 200)) throw new Error("中标公司无效"); values.winner = body.winner; }
  return values;
}
