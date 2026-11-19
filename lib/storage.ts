import OSS from "ali-oss";
import { createHmac } from "node:crypto";

function storageConfig() {
  const bucket = process.env.ALI_OOS_BUCKET_NAME;
  const accessKeyId = process.env.ALI_KEY_ID;
  const accessKeySecret = process.env.ALI_SECRECT;
  if (bucket !== "junyang-files-hangzhou" || !accessKeyId || !accessKeySecret) throw new Error("Storage configuration missing");
  return { bucket, accessKeyId, accessKeySecret };
}

export function signedFileUrl(path: string, download: boolean, filename?: string) {
  const client = new OSS({ ...storageConfig(), region: "oss-cn-hangzhou", secure: true });
  const downloadName = filename || path.split("/").pop() || "file";
  return client.signatureUrl(path, { expires: 300, ...(download ? { response: { "content-disposition": `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(downloadName).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}` } } : {}) });
}

export function uploadPolicy(key: string, maxSize: number) {
  const { bucket, accessKeyId, accessKeySecret } = storageConfig();
  const policy = Buffer.from(JSON.stringify({ expiration: new Date(Date.now() + 5 * 60 * 1000).toISOString(), conditions: [{ bucket }, ["eq", "$key", key], ["content-length-range", 1, maxSize]] })).toString("base64");
  return { bucket, accessKeyId, policy, signature: createHmac("sha1", accessKeySecret).update(policy).digest("base64") };
}

export async function uploadObject(key: string, bytes: Uint8Array, mime: string, maxSize: number) {
  const policy = uploadPolicy(key, maxSize);
  const form = new FormData();
  form.set("key", key); form.set("policy", policy.policy); form.set("OSSAccessKeyId", policy.accessKeyId);
  form.set("Signature", policy.signature); form.set("success_action_status", "200");
  form.set("file", new Blob([new Uint8Array(bytes)], { type: mime }), "upload");
  const response = await fetch(`https://${policy.bucket}.oss-cn-hangzhou.aliyuncs.com`, { method: "POST", body: form, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error("File storage failed");
}
