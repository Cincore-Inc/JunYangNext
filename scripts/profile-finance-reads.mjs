import nextEnv from '@next/env';
import { MongoClient } from 'mongodb';

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.MONGODB_URL) throw new Error('未配置 MONGODB_URL');
const client = new MongoClient(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 5000 });
try {
  await client.connect();
  const pings = [];
  for (let i = 0; i < 15; i++) {
    const start = Date.now();
    await client.db('admin').command({ ping: 1 });
    pings.push(Date.now() - start);
  }
  pings.sort((a, b) => a - b);
  console.log(JSON.stringify({ pingMinMs: pings[0], pingMedianMs: pings[7], pingMaxMs: pings[14] }));
  for (const kind of ['transactions', 'receipts', 'invoices']) {
    const collection = client.db('junyang-finance').collection(kind);
    const dateField = kind === 'transactions' ? 'transactionDate' : 'date';
    for (const field of ['createdAt', dateField, 'amount']) {
      const result = await collection.find({}, { projection: { _id: 1 }, maxTimeMS: 10000 }).sort({ [field]: -1, _id: -1 }).limit(25).explain('executionStats');
      const stats = result.executionStats;
      console.log(JSON.stringify({ kind, sort: field, returned: stats.nReturned, docsExamined: stats.totalDocsExamined, keysExamined: stats.totalKeysExamined, serverMs: stats.executionTimeMillis }));
    }
  }
} catch (error) {
  console.error('财务查询检查失败:', error instanceof Error ? error.name : 'unknown');
  process.exitCode = 1;
} finally {
  await client.close();
}
