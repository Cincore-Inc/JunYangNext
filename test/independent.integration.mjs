import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('旧服务关闭时项目、财务筛选和附件仍可使用', { timeout: 120000 }, async () => {
  const database = await MongoMemoryReplSet.create({ binary: { version: '7.0.24' }, replSet: { count: 1, ip: '127.0.0.1' } });
  const client = await new MongoClient(database.getUri()).connect();
  const base = `http://127.0.0.1:${await freePort()}`;
  const server = spawn('./node_modules/.bin/next', ['start', '--hostname', '127.0.0.1', '--port', new URL(base).port], {
    env: { ...process.env, MONGODB_URL: database.getUri(), JUNYANG_AUTH_MODE: 'local', JUNYANG_SESSION_SECRET: 'test-secret-at-least-thirty-two-characters', LEGACY_CORE_URL: 'http://127.0.0.1:1', JUNYANG_MYSQL_URL: 'mysql://test', ALI_KEY_ID: 'test', ALI_SECRECT: 'test-secret', ALI_OOS_BUCKET_NAME: 'junyang-files-hangzhou', NODE_OPTIONS: `--require=${process.cwd()}/test/mysql-shim.cjs --require=${process.cwd()}/test/isolated-oss-shim.cjs` }, stdio: 'ignore',
  });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) { try { await fetch(`${base}/login`); ready = true; break; } catch { await delay(100); } }
    assert.ok(ready, '测试服务器未启动');
    const login = await fetch(`${base}/api/session`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ username: 'localadmin', password: 'secret-admin' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const createdProject = await fetch(`${base}/api/projects`, { method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ name: '独立测试项目' }) });
    assert.equal(createdProject.status, 200); const createdId = (await createdProject.json()).id;
    const projectCollection = client.db('junyang-projects').collection('projects');
    const storedProject = await projectCollection.findOne({ _id: new ObjectId(createdId) });
    for (const kind of ['transactions', 'receipts', 'invoices']) await client.db('junyang-finance').collection(kind).insertOne({ project: { value: createdId, label: '独立测试项目' } });
    const projectData = { name: '更新测试项目', address: '', phone: '', lastEditedBy: '', bidMethod: '', bidStatus: '', bidAddress: '', caller: '', callerContact: '', callerPhone: '', callerBank: '', callerBankAccount: '', winnerOther: '', projectType: '', taxDeductRatio: '', materialRatio: '', laborRatio: '', description: '', notes: '', todo: '', fileNote: '', bidders: [], bids: [], tags: [], bidLimit: 0, winnerPrice: 0, managementFee: 0, tax: 0, bidStartTime: null, projectStart: null, projectEnd: null, requireOriginalFiles: null, projectNumber: null, status: '', updatedAt: storedProject.updatedAt.toISOString() };
    const editedProject = await fetch(`${base}/api/projects/${createdId}`, { method: 'PATCH', headers: { cookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify(projectData) });
    assert.equal(editedProject.status, 200);
    for (const kind of ['transactions', 'receipts', 'invoices']) assert.equal((await client.db('junyang-finance').collection(kind).findOne({ 'project.value': createdId })).project.label, '更新测试项目');
    await projectCollection.updateOne({ _id: new ObjectId(createdId) }, { $set: { name: '手动同步测试' } });
    assert.equal((await fetch(`${base}/api/projects/${createdId}/sync-name`, { method: 'POST', headers: { origin: base } })).status, 401);
    const syncedProject = await fetch(`${base}/api/projects/${createdId}/sync-name`, { method: 'POST', headers: { cookie, origin: base } }); assert.equal(syncedProject.status, 200);
    for (const kind of ['transactions', 'receipts', 'invoices']) assert.equal((await client.db('junyang-finance').collection(kind).findOne({ 'project.value': createdId })).project.label, '手动同步测试');
    const projectId = new ObjectId();
    await client.db('junyang-projects').collection('projects').insertOne({ _id: projectId, callerFiles: [] });
    for (const kind of ['transactions', 'receipts', 'invoices']) {
      const collection = client.db('junyang-finance').collection(kind);
      await collection.insertMany([{ amount: 100, direction: 'income', status: '未对账', ticketClass: '专票' }, { amount: 200, direction: 'income', status: '未对账', ticketClass: '专票', company: { value: null }, project: { value: '' } }, { amount: 300, direction: 'income', status: '未对账', ticketClass: '专票', company: { value: '12345678-1234-1234-1234-123456789abc' }, project: { value: String(projectId) } }]);
      const params = new URLSearchParams({ kind, filterCompanyId: '__unset__', filterProjectId: '__unset__' });
      const response = await fetch(`${base}/api/finance?${params}`, { headers: { cookie } });
      assert.equal(response.status, 200);
      const data = await response.json(); assert.equal(data.total, 2); assert.equal(data.summary.amount, 300);
      params.set('mode', kind === 'transactions' ? 'transactionMatrix' : 'invoiceMatrix');
      const summary = await fetch(`${base}/api/finance/summary?${params}`, { headers: { cookie } });
      assert.equal(summary.status, 200); assert.equal((await summary.json()).items.reduce((sum, row) => sum + row.total, 0), 300);
    }
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    for (const kind of ['projects', 'files', 'receipts', 'transactions']) {
      let id = projectId;
      if (kind === 'receipts' || kind === 'transactions') { id = new ObjectId(); await client.db('junyang-finance').collection(kind).insertOne({ _id: id }); }
      const form = new FormData(); form.set('kind', kind); if (kind !== 'files') form.set('id', String(id)); if (kind === 'projects') form.set('field', 'callerFiles'); form.set('file', new Blob([bytes], { type: 'image/png' }), 'test.png');
      assert.equal((await fetch(`${base}/api/attachments/upload`, { method: 'POST', headers: { cookie, origin: base }, body: form })).status, 200, kind);
      if (kind === 'files') id = (await client.db('junyang-files').collection('files').findOne({ filename: 'test.png' }))._id;
      const field = kind === 'projects' ? 'callerFiles' : kind === 'files' ? 'filepath' : kind === 'transactions' ? 'receipt' : 'receipts';
      const url = `${base}/api/attachments?${new URLSearchParams({ kind, id: String(id), field })}`;
      const preview = await fetch(url, { headers: { cookie } }); assert.equal(preview.status, 200, kind); assert.deepEqual(new Uint8Array(await preview.arrayBuffer()), bytes);
      const download = await fetch(`${url}&download=1`, { headers: { cookie }, redirect: 'manual' }); assert.equal(download.status, 307, kind); assert.match(download.headers.get('location'), /content-disposition/i);
    }
  } finally {
    server.kill('SIGTERM'); await client.close(); await database.stop();
  }
});
