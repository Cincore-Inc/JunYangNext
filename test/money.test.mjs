import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { formatMoney, parseMoney, projectInvoiceDifference } from '../lib/money.mjs';
test('金额按分准确显示，并拒绝不安全的整数', () => {
  assert.equal(formatMoney(123456), '¥1,234.56');
  assert.equal(formatMoney(-101), '-¥1.01');
  assert.equal(formatMoney(0), '¥0.00');
  assert.equal(formatMoney(Number.MAX_SAFE_INTEGER + 1), '金额异常');
});
test('金额输入精确换算为分', () => {
  assert.equal(parseMoney('-17.05'), -1705);
  assert.equal(parseMoney('0.1'), 10);
  assert.equal(parseMoney('12'), 1200);
  for (const value of ['1.001', '1e3', '', ' 1', '9999999999999', 1]) assert.equal(parseMoney(value), null);
});

test('项目发票差额按含税开票的92%减去不含税成本，并精确到分', () => {
  assert.equal(projectInvoiceDifference(100000, 80000), 12000);
  assert.equal(projectInvoiceDifference(100000, 100000), -8000);
  assert.equal(projectInvoiceDifference(0, 0), 0);
  assert.equal(projectInvoiceDifference(1, 0), 1);
  assert.equal(projectInvoiceDifference(7, 0), 6);
  assert.equal(projectInvoiceDifference(-7, 0), -6);
  assert.equal(projectInvoiceDifference(0, -100), 100);
  assert.ok(Number.isNaN(projectInvoiceDifference(1.5, 0)));
  assert.ok(Number.isNaN(projectInvoiceDifference(Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER)));
});
