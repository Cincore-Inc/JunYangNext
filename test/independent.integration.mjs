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

test('旧服务关闭时项目、财务和附件仍可使用', { timeout: 120000 }, async () => {
  const database = await MongoMemoryReplSet.create({ binary: { version: '7.0.24' }, replSet: { count: 1, ip: '127.0.0.1' } });
  const client = await new MongoClient(database.getUri()).connect();
  const base = `http://127.0.0.1:${await freePort()}`;
  const server = spawn('./node_modules/.bin/next', ['start', '--hostname', '127.0.0.1', '--port', new URL(base).port], {
    env: { ...process.env, MONGODB_URL: database.getUri(), JUNYANG_SESSION_SECRET: 'test-secret-at-least-thirty-two-characters', JUNYANG_MYSQL_URL: 'mysql://test', ALI_KEY_ID: 'test', ALI_SECRECT: 'test-secret', ALI_OOS_BUCKET_NAME: 'junyang-files-hangzhou', NODE_OPTIONS: `--require=${process.cwd()}/test/mysql-shim.cjs --require=${process.cwd()}/test/isolated-oss-shim.cjs` }, stdio: 'ignore',
  });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) { try { await fetch(`${base}/login`); ready = true; break; } catch { await delay(100); } }
    assert.ok(ready, '测试服务器未启动');
    const login = await fetch(`${base}/api/session`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ username: 'localadmin', password: 'secret-admin' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const staffLogin = await fetch(`${base}/api/session`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ username: 'localstaff', password: 'secret-staff' }) });
    assert.equal(staffLogin.status, 200);
    const staffCookie = staffLogin.headers.get('set-cookie').split(';')[0];
    const staffProfile = await (await fetch(`${base}/api/session`, { headers: { cookie: staffCookie } })).json();
    assert.equal(staffProfile.administrator, false); assert.equal(staffProfile.permissions.staff_view, true); assert.equal(staffProfile.permissions.finance_view, undefined);
    assert.equal((await fetch(`${base}/api/staff`, { headers: { cookie: staffCookie } })).status, 200);
    for (const endpoint of ['/api/projects', '/api/finance?kind=transactions', '/api/files', '/api/users', '/api/groups']) {
      assert.equal((await fetch(`${base}${endpoint}`, { headers: { cookie: staffCookie } })).status, 403, endpoint);
    }
    for (const [endpoint, body] of [['/api/projects', { name: '测试' }], ['/api/finance/create', { kind: 'transactions' }], ['/api/personnel/certificate', { staff_id: 1, cert_name: '测试', cert_sure: 'ON', cert_status: '', cert_start_date: '', cert_end_date: '', cert_next_date: '' }], ['/api/users', { username: 'test', password: 'test', staffId: 1, active: true, groupId: null }]]) {
      assert.equal((await fetch(`${base}${endpoint}`, { method: 'POST', headers: { cookie: staffCookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify(body) })).status, 403, endpoint);
    }
    const projects = client.db('junyang-projects').collection('projects');
    await projects.insertMany([
      { name: '筛选对照-中标', bidStatus: '已中标', bidMethod: '抽选', winner: '历史中标公司', bidStartTime: new Date('2026-10-15T00:00:00Z'), projectStart: new Date('2026-11-15T00:00:00Z') },
      { name: '筛选对照-投标中', bidStatus: '投标中', bidMethod: '低价中标', bidStartTime: new Date('2026-10-15T00:00:00Z') },
    ]);
    const queryProjects = async (params) => { const response = await fetch(`${base}/api/projects?${new URLSearchParams(params)}`, { headers: { cookie } }); assert.equal(response.status, 200); return response.json(); };
    assert.equal((await queryProjects({ q: '筛选对照' })).total, 2);
    assert.equal((await queryProjects({ q: '筛选对照', won: '1' })).total, 1);
    assert.equal((await queryProjects({ q: '筛选对照', bidMethods: '抽选', from: '2026-10-01', to: '2026-10-31' })).total, 1);
    assert.equal((await queryProjects({ q: '筛选对照', won: '1', from: '2026-11-01', to: '2026-11-30', winnerExact: '历史中标公司' })).total, 1);
    const winnerOptions = await fetch(`${base}/api/projects/options?${new URLSearchParams({ q: '历史中标', historical: '1' })}`, { headers: { cookie } });
    assert.equal(winnerOptions.status, 200); assert.ok((await winnerOptions.json()).items.some(item => item.value === 'legacy:历史中标公司'));
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
    const writeFinance = (path, method, payload) => fetch(`${base}/api/finance/${path}`, { method, headers: { cookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const refs = { projectId: createdId, companyId: '12345678-1234-1234-1234-123456789abc', date: '2026-11-19' };
    assert.equal((await writeFinance('create', 'POST', { kind: 'transactions', ...refs, title: '独立交易', type: '材料费', amount: '-123.45' })).status, 200);
    const transactions = client.db('junyang-finance').collection('transactions');
    const transaction = await transactions.findOne({ title: '独立交易' });
    assert.equal(Number(transaction.amount), -12345); assert.equal(transaction.direction, 'outgoing'); assert.equal(transaction.project.value, createdId);
    assert.equal((await writeFinance('transaction', 'PATCH', { id: String(transaction._id), updatedAt: transaction.updatedAt.toISOString(), title: '修改交易', amount: '200.50', status: '未对账' })).status, 200);
    const editedTransaction = await transactions.findOne({ _id: transaction._id });
    assert.equal(Number(editedTransaction.amount), 20050); assert.equal(editedTransaction.direction, 'income'); assert.equal(editedTransaction.title, '修改交易');
    for (const kind of ['receipts', 'invoices']) {
      const collection = client.db('junyang-finance').collection(kind);
      const numberField = kind === 'receipts' ? 'receiptId' : 'invoiceId';
      const number = `${kind}-independent`;
      const created = await writeFinance('create', 'POST', { kind, ...refs, number, party: '测试公司', ticketClass: '专票', amountWithoutTax: '100', tax: '6', projectNumber: 77 });
      assert.equal(created.status, 200);
      const { id: invoiceId } = await created.json();
      assert.match(invoiceId, /^[a-f\d]{24}$/i);
      const attachment = new FormData();
      attachment.set('kind', kind); attachment.set('id', invoiceId); attachment.set('field', kind);
      attachment.set('file', new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' }), '创建时上传.png');
      assert.equal((await fetch(`${base}/api/attachments/upload`, { method: 'POST', headers: { cookie, origin: base }, body: attachment })).status, 200);
      const original = await collection.findOne({ [numberField]: number });
      assert.equal(String(original._id), invoiceId); assert.equal(original[kind].length, 1);
      const preview = await fetch(`${base}/api/attachments?${new URLSearchParams({ kind, id: invoiceId, field: kind, index: '0' })}`, { headers: { cookie } });
      assert.equal(preview.status, 200); assert.match(preview.headers.get('content-type'), /^image\/png/);
      assert.equal(Number(original.amount), 10600); assert.equal(original.projectNumber, 77); assert.equal(original.project.value, createdId);
      assert.equal((await writeFinance('invoice', 'PATCH', { kind, id: String(original._id), updatedAt: original.updatedAt.toISOString(), number, party: '更新公司', ticketClass: '专票', amountWithoutTax: '200', tax: '12', ticketStatus: '有效', status: '已对账' })).status, 200);
      const edited = await collection.findOne({ _id: original._id });
      assert.equal(Number(edited.amount), 21200); assert.equal(edited.status, '已对账'); assert.ok(edited.verifiedAt);
      assert.equal((await writeFinance('create', 'POST', { kind, ...refs, number: `${number}-copy`, party: '更新公司', ticketClass: '专票', amountWithoutTax: '0', tax: '0', projectNumber: edited.projectNumber })).status, 200);
      const copy = await collection.findOne({ [numberField]: `${number}-copy` });
      assert.equal(copy.projectNumber, 77); assert.equal(Number(copy.amount), 0); assert.equal(copy.status, '未对账');
    }
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const receiptCollection = client.db('junyang-finance').collection('receipts');
    const verifiedReceipt = new ObjectId(), transferId = new ObjectId();
    await receiptCollection.insertOne({ _id: verifiedReceipt, status: '已对账', updatedAt: new Date('2026-11-01T00:00:00Z'), transferRecords: [{ _id: transferId, amount: 100, note: null }] });
    let receipt = await receiptCollection.findOne({ _id: verifiedReceipt });
    const transfer = { receiptId: String(verifiedReceipt), id: String(transferId), action: 'edit', updatedAt: receipt.updatedAt.toISOString(), date: '', amount: '1.25', note: '' };
    assert.equal((await writeFinance('transfers', 'POST', transfer)).status, 200);
    receipt = await receiptCollection.findOne({ _id: verifiedReceipt });
    assert.equal(Number(receipt.transferRecords[0].amount), 125); assert.equal(receipt.transferRecords[0].note, null);
    for (const replace of [false, true]) {
      const form = new FormData(); form.set('kind', 'receipts'); form.set('id', String(verifiedReceipt)); form.set('field', 'transferRecords'); form.set('transferId', String(transferId)); if (replace) form.set('replace', '1'); form.set('file', new Blob([bytes], { type: 'image/png' }), replace ? 'new.png' : 'original.png');
      assert.equal((await fetch(`${base}/api/attachments/upload`, { method: 'POST', headers: { cookie, origin: base }, body: form })).status, 200);
    }
    receipt = await receiptCollection.findOne({ _id: verifiedReceipt });
    assert.ok(receipt.transferRecords[0].file); assert.equal(receipt.archivedAttachments.length, 1);
    assert.equal((await writeFinance('transfers', 'POST', { ...transfer, action: 'delete', updatedAt: receipt.updatedAt.toISOString() })).status, 200);
    receipt = await receiptCollection.findOne({ _id: verifiedReceipt });
    assert.equal(receipt.status, '已对账'); assert.equal(receipt.transferRecords.length, 0); assert.equal(receipt.deletedTransferRecords.length, 1);
    for (const kind of ['projects', 'files', 'receipts', 'invoices', 'transactions']) {
      let id = projectId;
      if (kind === 'receipts' || kind === 'invoices' || kind === 'transactions') { id = new ObjectId(); await client.db('junyang-finance').collection(kind).insertOne({ _id: id }); }
      const form = new FormData(); form.set('kind', kind); if (kind !== 'files') form.set('id', String(id)); if (kind === 'projects') form.set('field', 'callerFiles'); if (kind === 'invoices') form.set('field', 'invoices'); form.set('file', new Blob([bytes], { type: 'image/png' }), 'test.png');
      const upload = await fetch(`${base}/api/attachments/upload`, { method: 'POST', headers: { cookie, origin: base }, body: form });
      assert.equal(upload.status, 200, `${kind}: ${await upload.text()}`);
      if (kind === 'files') id = (await client.db('junyang-files').collection('files').findOne({ filename: 'test.png' }))._id;
      const field = kind === 'projects' ? 'callerFiles' : kind === 'files' ? 'filepath' : kind === 'transactions' ? 'receipt' : kind === 'invoices' ? 'invoices' : 'receipts';
      const url = `${base}/api/attachments?${new URLSearchParams({ kind, id: String(id), field })}`;
      const preview = await fetch(url, { headers: { cookie } }); assert.equal(preview.status, 200, kind); assert.deepEqual(new Uint8Array(await preview.arrayBuffer()), bytes);
      const download = await fetch(`${url}&download=1`, { headers: { cookie }, redirect: 'manual' }); assert.equal(download.status, 307, kind); assert.match(download.headers.get('location'), /content-disposition/i);
    }
    const largeForm = new FormData(); largeForm.set('kind', 'projects'); largeForm.set('id', String(projectId)); largeForm.set('field', 'otherFiles');
    largeForm.set('file', new Blob([new Uint8Array(11 * 1024 * 1024).fill(65)]), '项目资料.dwg');
    assert.equal((await fetch(`${base}/api/attachments/upload`, { method: 'POST', headers: { cookie, origin: base }, body: largeForm })).status, 200);
    const largeDownload = await fetch(`${base}/api/attachments?${new URLSearchParams({ kind: 'projects', id: String(projectId), field: 'otherFiles', download: '1' })}`, { headers: { cookie }, redirect: 'manual' });
    assert.equal(largeDownload.status, 307); assert.match(decodeURIComponent(new URL(largeDownload.headers.get('location')).searchParams.get('response-content-disposition')), /项目资料\.dwg/);
    const deletedProjectResponse = await fetch(`${base}/api/projects`, { method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ name: '软删除隔离项目' }) });
    assert.equal(deletedProjectResponse.status, 200);
    const deletedProjectId = (await deletedProjectResponse.json()).id;
    const deletedProject = await projectCollection.findOne({ _id: new ObjectId(deletedProjectId) });
    assert.equal((await fetch(`${base}/api/projects/${deletedProjectId}`, { method: 'DELETE', headers: { cookie: staffCookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ updatedAt: deletedProject.updatedAt.toISOString() }) })).status, 403);
    assert.equal((await fetch(`${base}/api/projects/${deletedProjectId}`, { method: 'DELETE', headers: { cookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ updatedAt: deletedProject.updatedAt.toISOString() }) })).status, 200);
    const deletedRow = await projectCollection.findOne({ _id: new ObjectId(deletedProjectId) });
    assert.ok(deletedRow.deletedAt); assert.equal(deletedRow.deletedBy, 77);
    assert.equal((await queryProjects({ q: '软删除隔离项目' })).total, 0);
    assert.equal((await fetch(`${base}/api/projects/${deletedProjectId}`, { headers: { cookie } })).status, 404);
    assert.equal((await fetch(`${base}/api/projects/${deletedProjectId}`, { method: 'PATCH', headers: { cookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ ...projectData, updatedAt: deletedRow.updatedAt.toISOString() }) })).status, 409);
    assert.equal((await writeFinance('create', 'POST', { kind: 'transactions', projectId: deletedProjectId, companyId: refs.companyId, date: '2026-11-19', title: '不可关联已删除项目', type: '材料费', amount: '1' })).status, 400);
    const deletedUpload = new FormData(); deletedUpload.set('kind', 'projects'); deletedUpload.set('id', deletedProjectId); deletedUpload.set('field', 'otherFiles'); deletedUpload.set('file', new Blob([bytes], { type: 'image/png' }), 'deleted.png');
    assert.equal((await fetch(`${base}/api/attachments/upload`, { method: 'POST', headers: { cookie, origin: base }, body: deletedUpload })).status, 404);
  } finally {
    server.kill('SIGTERM'); await client.close(); await database.stop();
  }
});
