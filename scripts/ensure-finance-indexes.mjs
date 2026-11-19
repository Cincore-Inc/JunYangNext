import nextEnv from '@next/env';
import { MongoClient } from 'mongodb';

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.MONGODB_URL) throw new Error('未配置 MONGODB_URL');
const client = new MongoClient(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 7000 });
try {
  await client.connect();
  const collection = client.db('junyang-finance').collection('transactions');
  const key = { 'project.value': 1, transactionDate: -1, _id: -1 };
  const indexes = await collection.indexes().catch(error => { if (error.code === 26) return []; throw error; });
  const existing = indexes.find(index => JSON.stringify(index.key) === JSON.stringify(key));
  const name = existing?.name || await collection.createIndex(key, { name: 'project_transaction_date', background: true });
  console.log(`交易项目索引已就绪：${name}`);
} finally {
  await client.close();
}
