import { signedFileUrl } from "@/lib/storage";
import { fileType } from "@/lib/upload-file.mjs";

export function personnelFilename(path: string, mime: string) {
  const name = path.split("/").pop() || "image";
  if (/\.(?:jpe?g|png|gif|webp)$/i.test(name)) return name;
  const extension: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };
  return `${name}.${extension[mime]}`;
}

export async function readPersonnelMedia(path: unknown) {
  if (typeof path !== "string" || !/^oss:(?:staff|company)\/image\/[\w.-]+$/.test(path)) throw new Error("Personnel media has not been migrated");
  const url = signedFileUrl(`core-media/${path.slice(4)}`, false);
  const response = await fetch(url, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(10000) });
  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  const mime = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (!response.ok) throw new Error("File unavailable");
  if (mime && allowed.includes(mime)) return { response, mime };
  if (mime && mime !== "application/octet-stream" && mime !== "binary/octet-stream") throw new Error("File unavailable");
  const maxSize = 10 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > maxSize) throw new Error("File unavailable");
  const bytes = new Uint8Array(await response.arrayBuffer());
  const detected = fileType(bytes);
  if (bytes.length > maxSize || !detected || !allowed.includes(detected.mime)) throw new Error("File unavailable");
  return { response: new Response(bytes), mime: detected.mime };
}
