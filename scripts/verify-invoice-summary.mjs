import { MongoClient } from 'mongodb';

if (!process.env.MONGODB_URL) throw new Error('未配置 MONGODB_URL');
const client = new MongoClient(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 5000 });
const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' });

function legacyKey(value, group) {
  if (group === 'deductDate') return value ? month.format(value) : 'unset';
  if (group === 'ticketStatus') return value ?? 'unset';
  return value?.value ?? `label:${value?.label ?? 'unset'}`;
}

function grouping(group) {
  if (group === 'deductDate') return { $dateToString: { format: '%Y-%m', date: '$deductDate', timezone: 'Asia/Shanghai', onNull: 'unset' } };
  if (group === 'ticketStatus') return { $ifNull: ['$ticketStatus', 'unset'] };
  return { $ifNull: [`$${group}.value`, { $concat: ['label:', { $ifNull: [`$${group}.label`, 'unset'] }] }] };
}

function sumFor(ticketClass, field) {
  return { $sum: { $cond: [{ $eq: ['$ticketClass', ticketClass] }, { $ifNull: [`$${field}`, 0] }, 0] } };
}

try {
  await client.connect();
  for (const kind of ['receipts', 'invoices']) for (const group of ['company', 'project', 'ticketStatus', 'deductDate']) {
    const collection = client.db('junyang-finance').collection(kind);
    const original = await collection.aggregate([
      { $group: { _id: { category: '$ticketClass', value: `$${group}` }, tax: { $sum: '$tax' }, net: { $sum: '$amountWithoutTax' }, amount: { $sum: '$amount' } } },
    ], { maxTimeMS: 10000, batchSize: 5000 }).toArray();
    const current = await collection.aggregate([
      { $group: { _id: grouping(group), st: sumFor('专票', 'tax'), sn: sumFor('专票', 'amountWithoutTax'), sa: sumFor('专票', 'amount'), ot: sumFor('普票', 'tax'), on: sumFor('普票', 'amountWithoutTax'), oa: sumFor('普票', 'amount') } },
    ], { maxTimeMS: 10000, batchSize: 5000 }).toArray();
    const expected = new Map();
    for (const row of original) {
      const key = legacyKey(row._id.value, group);
      const sums = expected.get(key) || [0, 0, 0, 0, 0, 0];
      const offset = row._id.category === '专票' ? 0 : row._id.category === '普票' ? 3 : -1;
      if (offset >= 0) { sums[offset] += Number(row.tax); sums[offset + 1] += Number(row.net); sums[offset + 2] += Number(row.amount); }
      expected.set(key, sums);
    }
    let mismatches = 0;
    for (const row of current) {
      const sums = expected.get(row._id);
      const actual = [row.st, row.sn, row.sa, row.ot, row.on, row.oa].map(Number);
      if (!sums || actual.some((value, index) => value !== sums[index])) mismatches++;
    }
    mismatches += Math.abs(expected.size - current.length);
    console.log(JSON.stringify({ kind, group, legacyGroups: expected.size, newGroups: current.length, mismatches }));
    if (mismatches) process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.name : '查询失败');
  process.exitCode = 1;
} finally {
  await client.close();
}
