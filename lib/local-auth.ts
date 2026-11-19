import { createHmac, pbkdf2 as pbkdf2Callback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { RowDataPacket } from "mysql2";
import { getMysql } from "@/lib/mysql";
import definitions from "@/lib/legacy-permissions.json";

const pbkdf2 = promisify(pbkdf2Callback);
function secret() {
  const value = process.env.JUNYANG_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("Session configuration missing");
  return value;
}
function signature(value: string) { return createHmac("sha256", secret()).update(value).digest("base64url"); }
function equal(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function passwordVersion(password: string) { return signature(`password:${password}`); }

export async function checkPassword(input: string, stored: string, superuser: boolean) {
  if (!superuser) return equal(input, stored);
  const [algorithm, iterations, salt, encoded, extra] = stored.split("$");
  const count = Number(iterations);
  if (algorithm !== "pbkdf2_sha256" || !Number.isSafeInteger(count) || count < 1 || count > 2000000 || !salt || !encoded || extra !== undefined) return false;
  const actual = (await pbkdf2(input, salt, count, 32, "sha256")).toString("base64");
  return equal(actual, encoded);
}

export function issueLocalSession(id: number, password: string) {
  const payload = Buffer.from(JSON.stringify({ user_id: id, exp: Math.floor(Date.now() / 1000) + 3600, version: passwordVersion(password) })).toString("base64url");
  return `v1.${payload}.${signature(`v1.${payload}`)}`;
}

export async function localSession(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !equal(signature(`v1.${parts[1]}`), parts[2])) return null;
  let payload: { user_id?: number; exp?: number; version?: string };
  try { payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")); } catch { return null; }
  if (!Number.isSafeInteger(payload.user_id) || payload.user_id! < 1 || !Number.isSafeInteger(payload.exp) || payload.exp! <= Date.now() / 1000 || typeof payload.version !== "string") return null;
  const db = getMysql();
  const [users] = await db.execute<RowDataPacket[]>("SELECT u.id, u.username, u.password, u.is_active, u.is_superuser, s.name FROM auth_user u LEFT JOIN staff_staff s ON s.user_id = u.id WHERE u.id = ? LIMIT 1", [payload.user_id!]);
  const user = users[0];
  if (!user || !user.is_active || !equal(payload.version, passwordVersion(user.password))) return null;
  const [groups] = await db.execute<RowDataPacket[]>("SELECT g.name FROM auth_user_groups ug JOIN auth_group g ON g.id = ug.group_id WHERE ug.user_id = ? AND NOT EXISTS (SELECT 1 FROM junyang_deleted_roles d WHERE d.group_id = g.id)", [user.id]);
  const administrator = Boolean(user.is_superuser) || groups.some((row) => row.name === "管理");
  const codes = Object.keys(definitions.labels);
  const [permissions] = await db.execute<RowDataPacket[]>(`SELECT DISTINCT p.codename, p.name FROM auth_permission p WHERE p.codename IN (${codes.map(() => "?").join(",")}) AND (p.id IN (SELECT permission_id FROM auth_group_permissions gp JOIN auth_user_groups ug ON ug.group_id = gp.group_id WHERE ug.user_id = ? AND NOT EXISTS (SELECT 1 FROM junyang_deleted_roles d WHERE d.group_id = gp.group_id)) OR p.id IN (SELECT permission_id FROM auth_user_user_permissions WHERE user_id = ?))`, [...codes, user.id, user.id]);
  return { username: String(user.username), name: String(user.name || ""), administrator, permissions: Object.fromEntries(permissions.filter((row) => (definitions.labels as Record<string, string>)[row.codename] === row.name).map((row) => [String(row.codename), true])) as Record<string, boolean> };
}
