import { test } from 'node:test';
import assert from 'node:assert/strict';
import { financeFilter } from '../lib/finance-filter.mjs';

test('财务筛选转义关键词并按北京时间包含结束日', () => {
  const params = new URLSearchParams({ q: 'a.*', from: '2026-11-01', to: '2026-11-02', direction: 'income', status: '未对账' });
  const filter = financeFilter(params, 'transactions');
  assert.equal(filter.$or[0]['project.label'].$regex, 'a\\.\\*');
  assert.equal(filter.transactionDate.$gte.toISOString(), '2026-10-31T16:00:00.000Z');
  assert.equal(filter.transactionDate.$lt.toISOString(), '2026-11-02T16:00:00.000Z');
  assert.equal(filter.direction, 'income');
  const invoice = financeFilter(new URLSearchParams({ dateField: 'deductDate', type: '专票', from: '2026-11-01' }), 'receipts');
  assert.equal(invoice.ticketClass, '专票'); assert.ok(invoice.deductDate.$gte);
  assert.throws(() => financeFilter(new URLSearchParams({ dateField: 'deductDate' }), 'transactions'));
  assert.throws(() => financeFilter(new URLSearchParams({ from: '2026-02-30' }), 'receipts'));
  assert.throws(() => financeFilter(new URLSearchParams({ from: '2026-12-01', to: '2026-11-01' }), 'receipts'));
  assert.throws(() => financeFilter(new URLSearchParams({ direction: 'income' }), 'receipts'));
  assert.equal(financeFilter(new URLSearchParams({ projectId: '0123456789abcdef01234567' }), 'transactions')['project.value'], '0123456789abcdef01234567');
  assert.throws(() => financeFilter(new URLSearchParams({ projectId: 'invalid' }), 'transactions')); 
});

test('财务项目和公司按标识筛选并保持项目权限范围', () => {
  const project = '0123456789abcdef01234567';
  const company = '12345678-1234-1234-1234-123456789abc';
  for (const kind of ['transactions', 'receipts', 'invoices']) {
    const filter = financeFilter(new URLSearchParams({ filterProjectId: project, filterCompanyId: company }), kind);
    assert.equal(filter['project.value'], project);
    assert.equal(filter['company.value'], company);
  }
  for (const kind of ['transactions', 'receipts', 'invoices']) {
    const unlinked = financeFilter(new URLSearchParams({ filterProjectId: '__unset__', filterCompanyId: '__unset__' }), kind);
    assert.deepEqual(unlinked['project.value'], { $in: [null, ''] });
    assert.deepEqual(unlinked['company.value'], { $in: [null, ''] });
  }
  assert.throws(() => financeFilter(new URLSearchParams({ projectId: project, filterProjectId: '__unset__' }), 'receipts'));
  assert.throws(() => financeFilter(new URLSearchParams({ filterProjectId: 'bad' }), 'receipts'));
  assert.throws(() => financeFilter(new URLSearchParams({ filterCompanyId: 'bad' }), 'receipts'));
  assert.throws(() => financeFilter(new URLSearchParams({ projectId: project, filterProjectId: 'abcdef012345678901234567' }), 'receipts'));
});

test('交易对方筛选匹配旧版户名与对方名称，并可组合关键词', () => {
  const filter = financeFilter(new URLSearchParams({ party: '张.*', q: '材料' }), 'transactions');
  assert.equal(filter.$and[0].$or[0].oppositeAccountName.$regex, '张\\.\\*');
  assert.equal(filter.$and[0].$or[1].oppositeName.$regex, '张\\.\\*');
  assert.ok(filter.$or.some(entry => entry.title));
  assert.equal(financeFilter(new URLSearchParams({ party: '甲方' }), 'invoices').buyer.$regex, '甲方');
});

test('交易关键词覆盖旧版名目、户名、渠道及备注', () => {
  const filter = financeFilter(new URLSearchParams({ q: '测试' }), 'transactions');
  for (const field of ['name', 'title', 'accountName', 'channel', 'oppositeName', 'oppositeAccountName', 'oppositeChannel', 'note']) {
    assert.ok(filter.$or.some(entry => entry[field]?.$regex === '测试'), field);
  }
});

test('收开票关键词匹配用途、税额和不含税金额', () => {
  for (const kind of ['receipts', 'invoices']) {
    const text = financeFilter(new URLSearchParams({ q: '材料.*' }), kind);
    assert.ok(text.$or.some(entry => entry.purpose?.$regex === '材料\\.\\*'));
    const amount = financeFilter(new URLSearchParams({ q: '12.34' }), kind);
    for (const field of ['amount', 'tax', 'amountWithoutTax']) assert.ok(amount.$or.some(entry => entry[field] === 1234));
  }
  const transaction = financeFilter(new URLSearchParams({ q: '12.34' }), 'transactions');
  assert.ok(!transaction.$or.some(entry => 'tax' in entry || 'amountWithoutTax' in entry));
});

test('票据用途和计税方式支持多选且按类型校验', () => {
  const purpose = JSON.stringify(['劳务成本', '材料成本']);
  assert.deepEqual(financeFilter(new URLSearchParams({ purpose }), 'receipts').purpose, { $in: ['劳务成本', '材料成本'] });
  assert.deepEqual(financeFilter(new URLSearchParams({ taxCode: JSON.stringify(['一般计税']) }), 'invoices').taxCode, { $in: ['一般计税'] });
  assert.throws(() => financeFilter(new URLSearchParams({ purpose }), 'invoices'));
  assert.throws(() => financeFilter(new URLSearchParams({ taxCode: '["不存在"]' }), 'invoices'));
  assert.throws(() => financeFilter(new URLSearchParams({ purpose: 'invalid' }), 'receipts'));
});

test('票据种类和收票类型支持多选并兼容原有单值', () => {
  const filter = financeFilter(new URLSearchParams({ type: '["专票","普票"]', receiptType: '["工程票","工资表"]' }), 'receipts');
  assert.deepEqual(filter.ticketClass, { $in: ['专票', '普票'] });
  assert.deepEqual(filter.receiptType, { $in: ['工程票', '工资表'] });
  assert.equal(financeFilter(new URLSearchParams({ type: '专票' }), 'invoices').ticketClass, '专票');
  assert.throws(() => financeFilter(new URLSearchParams({ type: '[]' }), 'invoices'));
  assert.throws(() => financeFilter(new URLSearchParams({ receiptType: '["工程票"]' }), 'invoices'));
});

test('未设置状态包含空值及缺失记录', () => {
  const filter = financeFilter(new URLSearchParams({ status: '未设置', ticketStatus: '未设置' }), 'receipts');
  assert.deepEqual(filter.status, { $in: [null, ''] });
  assert.deepEqual(filter.ticketStatus, { $in: [null, ''] });
});

test('交易收支方向可筛选未设置', () => {
  assert.deepEqual(financeFilter(new URLSearchParams({ direction: '__unset__' }), 'transactions').direction, { $in: [null, ''] });
  assert.throws(() => financeFilter(new URLSearchParams({ direction: '__unset__' }), 'receipts'));
});

test('票据分类可组合未设置和其他选项', () => {
  const filter = financeFilter(new URLSearchParams({ type: '["专票","__unset__"]', receiptType: '["__unset__","工程票"]', purpose: '["__unset__","材料成本"]' }), 'receipts');
  assert.deepEqual(filter.ticketClass, { $in: ['专票', null, ''] });
  assert.deepEqual(filter.receiptType, { $in: [null, '', '工程票'] });
  assert.deepEqual(filter.purpose, { $in: [null, '', '材料成本'] });
  assert.deepEqual(financeFilter(new URLSearchParams({ taxCode: '["__unset__"]' }), 'invoices').taxCode, { $in: [null, ''] });
});

test('财务日期范围可组合且与旧参数取交集', () => {
  const filter = financeFilter(new URLSearchParams({ dateFrom: '2026-10-01', dateTo: '2026-10-31', deductFrom: '2026-11-01', deductTo: '2026-11-30', verifiedFrom: '2026-12-01', submitTo: '2027-01-01', dateField: 'date', from: '2026-10-10', to: '2026-11-10' }), 'receipts');
  assert.equal(filter.date.$gte.toISOString(), '2026-10-09T16:00:00.000Z');
  assert.equal(filter.date.$lt.toISOString(), '2026-10-31T16:00:00.000Z');
  assert.equal(filter.deductDate.$gte.toISOString(), '2026-10-31T16:00:00.000Z');
  assert.equal(filter.deductDate.$lt.toISOString(), '2026-11-30T16:00:00.000Z');
  assert.equal(filter.verifiedAt.$gte.toISOString(), '2026-11-30T16:00:00.000Z');
  assert.equal(filter.submitDate.$lt.toISOString(), '2027-01-01T16:00:00.000Z');
  assert.throws(() => financeFilter(new URLSearchParams({ deductFrom: '2026-12-01', deductTo: '2026-11-01' }), 'receipts'));
  assert.throws(() => financeFilter(new URLSearchParams({ deductFrom: '2026-11-01' }), 'transactions'));
  const receipt = financeFilter(new URLSearchParams({ dateFrom: '2026-10-01', issueFrom: '2026-11-01', issueTo: '2026-11-02' }), 'receipts');
  assert.equal(receipt.date.$gte.toISOString(), '2026-09-30T16:00:00.000Z');
  assert.equal(receipt.issueDate.$gte.toISOString(), '2026-10-31T16:00:00.000Z');
  assert.equal(receipt.issueDate.$lt.toISOString(), '2026-11-02T16:00:00.000Z');
  assert.throws(() => financeFilter(new URLSearchParams({ issueFrom: '2026-11-01' }), 'invoices'));
});

test('财务状态支持多选、未设置和旧版单值', () => {
  const params = new URLSearchParams({ status: '["已对账","未设置"]', ticketStatus: '["有效","作废","未设置"]' });
  const filter = financeFilter(params, 'receipts');
  assert.deepEqual(filter.status, { $in: ['已对账', null, ''] });
  assert.deepEqual(filter.ticketStatus, { $in: ['有效', '作废', null, ''] });
  assert.equal(financeFilter(new URLSearchParams({ status: '未对账', ticketStatus: '有效' }), 'invoices').status, '未对账');
  for (const input of ['[]', '["无效"]', '[1]', '["有效",', '["有效","作废","未交票","已抵扣","未设置","有效"]']) assert.throws(() => financeFilter(new URLSearchParams({ ticketStatus: input }), 'receipts'));
  assert.throws(() => financeFilter(new URLSearchParams({ ticketStatus: '["有效"]' }), 'transactions'));
});
