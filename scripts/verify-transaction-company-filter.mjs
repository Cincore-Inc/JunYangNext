import { MongoClient } from 'mongodb';
import { financeFilter } from '../lib/finance-filter.mjs';

const client = new MongoClient(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 5000 });
try {
  await client.connect();
  const transactions = client.db('junyang-finance').collection('transactions');
  const groups = await transactions.aggregate([
    { $match: { 'company.value': { $type: 'string', $regex: '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' } } },
    { $group: { _id: '$company.value', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
  ], { maxTimeMS: 30000, batchSize: 5000 }).toArray();
  let mismatches = 0;
  for (const group of groups) {
    const filter = financeFilter(new URLSearchParams({ filterCompanyId: group._id }), 'transactions');
    const [actual] = await transactions.aggregate([
      { $match: filter },
      { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amount' } } },
    ], { maxTimeMS: 30000 }).toArray();
    if (!actual || Number(actual.count) !== Number(group.count) || Number(actual.amount) !== Number(group.amount)) mismatches++;
  }
  console.log(JSON.stringify({ groups: groups.length, mismatches }));
  if (mismatches) process.exitCode = 1;
} catch (error) {
  console.error('交易公司筛选核对失败:', error instanceof Error ? error.name : 'unknown');
  process.exitCode = 1;
} finally {
  await client.close();
}
