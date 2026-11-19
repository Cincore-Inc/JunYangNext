import { signedFileUrl } from "@/lib/storage";

export async function readPersonnelMedia(path: unknown) {
  if (typeof path !== "string" || !/^oss:(?:staff|company)\/image\/[\w.-]+$/.test(path)) throw new Error("Personnel media has not been migrated");
  const url = signedFileUrl(`core-media/${path.slice(4)}`, false);
  const response = await fetch(url, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(10000) });
  const mime = response.headers.get("content-type")?.split(";")[0];
  if (!response.ok || !mime || !["image/jpeg", "image/png"].includes(mime)) throw new Error("File unavailable");
  return { response, mime };
}
