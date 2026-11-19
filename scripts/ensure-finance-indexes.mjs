import nextEnv from '@next/env';
import { MongoClient } from 'mongodb';

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.MONGODB_URL) throw new Error('未配置 MONGODB_URL');
const client = new MongoClient(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 7000 });
try {
  await client.connect();
  const specs = [
    { collection: 'transactions', name: 'project_transaction_date', key: { 'project.value': 1, transactionDate: -1, _id: -1 } },
    ...['transactions', 'receipts', 'invoices'].map(collection => ({ collection, name: 'created_at_desc', key: { createdAt: -1, _id: -1 } })),
    ...['transactions', 'receipts', 'invoices'].map(collection => ({ collection, name: 'company_created_at', key: { 'company.value': 1, createdAt: -1, _id: -1 } })),
  ];
  for (const spec of specs) {
    const collection = client.db('junyang-finance').collection(spec.collection);
    const indexes = await collection.indexes().catch(error => { if (error.code === 26) return []; throw error; });
    const existing = indexes.find(index => JSON.stringify(index.key) === JSON.stringify(spec.key));
    const name = existing?.name || await collection.createIndex(spec.key, { name: spec.name, background: true });
    console.log(`${spec.collection} 索引已就绪：${name}`);
  }
} finally {
  await client.close();
}
