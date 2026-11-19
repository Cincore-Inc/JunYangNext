import mysql from "mysql2/promise";

const globalDatabase = globalThis as typeof globalThis & { junyangMysql?: mysql.Pool };
export function getMysql() {
  if (!process.env.JUNYANG_MYSQL_URL) throw new Error("未配置账号数据库连接");
  if (!globalDatabase.junyangMysql) globalDatabase.junyangMysql = mysql.createPool({ uri: process.env.JUNYANG_MYSQL_URL, connectionLimit: 3, connectTimeout: 5000 });
  return globalDatabase.junyangMysql;
}
