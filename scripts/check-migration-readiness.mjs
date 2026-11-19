import nextEnv from '@next/env';
import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';

nextEnv.loadEnvConfig(process.cwd());
const failures = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? '通过' : '未通过'}：${name}${detail ? `（${detail}）` : ''}`);
  if (!ok) failures.push(name);
};

check('独立认证配置', (process.env.JUNYANG_SESSION_SECRET?.length || 0) >= 32);
check('对象存储配置', process.env.ALI_OOS_BUCKET_NAME === 'junyang-files-hangzhou' && !!process.env.ALI_KEY_ID && !!process.env.ALI_SECRECT, '仅检查配置，不验证存储访问');

let mongo;
try {
  if (!process.env.MONGODB_URL) throw new Error();
  mongo = await new MongoClient(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 5000 }).connect();
  const hello = await mongo.db('admin').command({ hello: 1 });
  check('MongoDB 事务能力', !!hello.logicalSessionTimeoutMinutes && (!!hello.setName || hello.msg === 'isdbgrid'));
  for (const [db, collection] of [['junyang-projects', 'projects'], ['junyang-finance', 'transactions'], ['junyang-finance', 'receipts'], ['junyang-finance', 'invoices'], ['junyang-files', 'files']]) {
    if (!await mongo.db(db).listCollections({ name: collection }, { nameOnly: true }).next()) throw new Error('Collection missing');
    await mongo.db(db).collection(collection).findOne({}, { projection: { _id: 1 }, maxTimeMS: 10000 });
  }
  check('MongoDB 数据读取', true);
} catch {
  check('MongoDB 数据读取', false, '请检查连接及读取权限');
} finally { await mongo?.close(); }

let db;
try {
  if (!process.env.JUNYANG_MYSQL_URL) throw new Error();
  db = await mysql.createConnection(process.env.JUNYANG_MYSQL_URL);
  const [tables] = await db.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('junyang_deleted_companies', 'junyang_deleted_personnel', 'junyang_deleted_roles')");
  check('软删除标记表', tables.length === 3, `${tables.length}/3`);
  const [images] = await db.query("SELECT (SELECT COUNT(*) FROM staff_imagelist WHERE image IS NOT NULL AND image <> '' AND image NOT LIKE 'oss:%') + (SELECT COUNT(*) FROM staff_insurancedetail WHERE company_payproof IS NOT NULL AND company_payproof <> '' AND company_payproof NOT LIKE 'oss:%') + (SELECT COUNT(*) FROM staff_insurancedetail WHERE persenal_payproof IS NOT NULL AND persenal_payproof <> '' AND persenal_payproof NOT LIKE 'oss:%') AS pending");
  const pending = Number(images[0].pending);
  check('历史人员媒体迁移', pending === 0, `${pending} 条待迁移`);
  check('MySQL 数据读取', true);
} catch {
  check('MySQL 数据读取', false, '请检查连接及读取权限');
} finally { await db?.end(); }

if (failures.length) process.exitCode = 1;
