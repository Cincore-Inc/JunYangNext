import type { RowDataPacket } from "mysql2";
import { getMysql } from "@/lib/mysql";
import definitions from "@/lib/legacy-permissions.json";

type CatalogNode = { id: number; label: string; flag: boolean; children: CatalogNode[] };
type SourceNode = { permission: string; children: SourceNode[] };
export async function permissionCatalog() {
  const codes = Object.keys(definitions.labels);
  const [rows] = await getMysql().execute<RowDataPacket[]>(`SELECT id, codename FROM auth_permission WHERE codename IN (${codes.map(() => "?").join(",")}) ORDER BY id`, codes);
  const ids = new Map<string, number>();
  for (const row of rows) if (!ids.has(row.codename)) ids.set(row.codename, Number(row.id));
  const build = (nodes: SourceNode[]): CatalogNode[] => nodes.map((node) => {
    const id = ids.get(node.permission); if (!id) throw new Error("Missing permission definition");
    return { id, label: (definitions.labels as Record<string, string>)[node.permission], flag: true, children: build(node.children) };
  });
  return build(definitions.tree);
}
