import { ObjectId } from "mongodb";
import type { RowDataPacket } from "mysql2";
import { getMongo } from "@/lib/db";
import { getMysql } from "@/lib/mysql";

export async function financeReferences(projectId: unknown, companyId: unknown) {
  if ((projectId != null && typeof projectId !== "string") || (companyId != null && typeof companyId !== "string")) return null;
  const [project, company] = await Promise.all([projectId ? financeProjectReference(projectId) : null, companyId ? financeCompanyReference(companyId) : null]);
  if ((projectId && !project) || (companyId && !company)) return null;
  return { project: project?.ref, company: company || undefined, projectNumber: project?.projectNumber };
}

export async function financeProjectReference(id: unknown) {
  if (typeof id !== "string" || !/^[a-f\d]{24}$/i.test(id)) return null;
  const project = await (await getMongo()).db("junyang-projects").collection("projects").findOne({ _id: new ObjectId(id) }, { projection: { name: 1, projectNumber: 1 }, maxTimeMS: 10000 });
  return project ? { ref: { value: id, label: project.name || "未命名项目" }, projectNumber: project.projectNumber } : null;
}

export async function financeCompanyReference(id: unknown) {
  if (typeof id !== "string" || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id)) return null;
  const [companies] = await getMysql().execute<RowDataPacket[]>("SELECT name, short_name FROM company_companys c WHERE u_id = ? AND NOT EXISTS (SELECT 1 FROM junyang_deleted_companies d WHERE d.company_id = c.id)", [id.replaceAll("-", "")]);
  return companies.length ? { value: id, label: companies[0].short_name || companies[0].name } : null;
}
