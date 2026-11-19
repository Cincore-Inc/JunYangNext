import { parseMoney } from './money.mjs';
function startOfDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('日期格式无效');
  const date = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime()) || new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10) !== value) throw new Error('日期格式无效');
  return date;
}

export function financeFilter(params, kind) {
  const filter = {};
  const selectValue = (value) => {
    if (!value.startsWith('[')) return value;
    let selected; try { selected = JSON.parse(value); } catch { throw new Error('票据筛选条件无效'); }
    if (!Array.isArray(selected) || !selected.length || selected.length > 20 || selected.some(item => typeof item !== 'string' || !item.trim() || item.length > 100)) throw new Error('票据筛选条件无效');
    return { $in: [...new Set(selected)] };
  };
  const projectId = params.get("projectId") || "";
  if (projectId && !/^[a-f\d]{24}$/i.test(projectId)) throw new Error("项目编号无效");
  if (projectId) filter["project.value"] = projectId;
  const filterProjectId = params.get('filterProjectId') || '';
  const filterCompanyId = params.get('filterCompanyId') || '';
  if (filterProjectId && !/^[a-f\d]{24}$/i.test(filterProjectId)) throw new Error('项目筛选无效');
  if (filterCompanyId && !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(filterCompanyId)) throw new Error('公司筛选无效');
  if (filterProjectId && projectId && filterProjectId !== projectId) throw new Error('项目筛选与当前项目不一致');
  if (filterProjectId) filter['project.value'] = filterProjectId;
  if (filterCompanyId) filter['company.value'] = filterCompanyId;
  const q = (params.get('q') || '').trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (q) {
    filter.$or = ['project.label', 'project.name', 'company.label', 'company.name', 'invoiceId', 'receiptId', 'title', 'issuer', 'buyer', 'person', 'name', 'accountName', 'channel', 'oppositeName', 'oppositeAccountName', 'oppositeChannel', 'note', 'todo', 'tags', ...(kind === 'transactions' ? [] : ['purpose'])].map((field) => ({ [field]: { $regex: q, $options: 'i' } }));
    const amount = parseMoney((params.get('q') || '').trim());
    if (amount !== null) filter.$or.push({ amount }, ...(kind === 'transactions' ? [] : [{ tax: amount }, { amountWithoutTax: amount }]));
  }
  for (const [parameter, field] of [['project', 'project.label'], ['company', 'company.label'], ... (kind === 'transactions' ? [] : [['party', kind === 'receipts' ? 'issuer' : 'buyer']])]) {
    const text = (params.get(parameter) || '').trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (text) filter[field] = { $regex: text, $options: 'i' };
  }
  if (kind === 'transactions') {
    const party = (params.get('party') || '').trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (party) filter.$and = [{ $or: ['oppositeAccountName', 'oppositeName'].map(field => ({ [field]: { $regex: party, $options: 'i' } })) }];
  }
  const receiptType = (params.get('receiptType') || '').trim().slice(0, 100);
  if (receiptType && kind !== 'receipts') throw new Error('发票类型无效');
  if (receiptType) filter.receiptType = selectValue(receiptType);
  for (const [parameter, allowedKind, choices] of [['purpose', 'receipts', ['劳务成本', '材料成本', '抵增值税']], ['taxCode', 'invoices', ['简易计税', '一般计税']]]) {
    const raw = params.get(parameter);
    if (!raw) continue;
    let selected;
    try { selected = JSON.parse(raw); } catch { throw new Error('票据筛选条件无效'); }
    if (kind !== allowedKind || !Array.isArray(selected) || !selected.length || selected.some(value => typeof value !== 'string' || !choices.includes(value))) throw new Error('票据筛选条件无效');
    filter[parameter] = { $in: [...new Set(selected)] };
  }
  const status = params.get('status') || '';
  if (status && !['已对账', '未对账', '未设置'].includes(status)) throw new Error('对账状态无效');
  if (status) filter.status = status === '未设置' ? { $in: [null, ''] } : status;
  const ticket = params.get('ticketStatus') || '';
  if (ticket && (kind === 'transactions' || !['有效', '作废', '已抵扣', '未交票', '未设置'].includes(ticket))) throw new Error('发票状态无效');
  if (ticket) filter.ticketStatus = ticket === '未设置' ? { $in: [null, ''] } : ticket;
  const direction = params.get('direction') || '';
  if (direction && (kind !== 'transactions' || !['income', 'outgoing'].includes(direction))) throw new Error('收支方向无效');
  if (direction) filter.direction = direction;
  const type = (params.get('type') || '').trim().slice(0, 100);
  if (type) filter[kind === 'transactions' ? 'transactionType' : 'ticketClass'] = kind === 'transactions' ? type : selectValue(type);
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const dateField = params.get('dateField') || (kind === 'transactions' ? 'transactionDate' : 'date');
  if (!(kind === 'transactions' ? ['transactionDate', 'verifiedAt'] : ['date', 'deductDate', 'submitDate', 'verifiedAt']).includes(dateField)) throw new Error('日期类型无效');
  const first = from ? startOfDay(from) : null;
  const last = to ? startOfDay(to) : null;
  if (first && last && first > last) throw new Error('开始日期不能晚于结束日期');
  if (first || last) filter[dateField] = { ...(first && { $gte: first }), ...(last && { $lt: new Date(last.getTime() + 86400000) }) };
  if (kind === 'transactions' && ['deductFrom', 'deductTo', 'submitFrom', 'submitTo'].some(key => params.get(key))) throw new Error('日期类型无效');
  if (kind !== 'receipts' && ['issueFrom', 'issueTo'].some(key => params.get(key))) throw new Error('日期类型无效');
  const ranges = [['date', kind === 'transactions' ? 'transactionDate' : 'date'], ['verified', 'verifiedAt'], ...(kind === 'transactions' ? [] : [['deduct', 'deductDate'], ['submit', 'submitDate']]), ...(kind === 'receipts' ? [['issue', 'issueDate']] : [])];
  for (const [prefix, field] of ranges) {
    const fromValue = params.get(`${prefix}From`) || '', toValue = params.get(`${prefix}To`) || '';
    const rangeStart = fromValue ? startOfDay(fromValue) : null, rangeEnd = toValue ? startOfDay(toValue) : null;
    if (rangeStart && rangeEnd && rangeStart > rangeEnd) throw new Error('开始日期不能晚于结束日期');
    if (!rangeStart && !rangeEnd) continue;
    const old = filter[field] || {};
    const lower = rangeStart && old.$gte ? new Date(Math.max(rangeStart.getTime(), old.$gte.getTime())) : rangeStart || old.$gte;
    const upper = rangeEnd ? new Date(rangeEnd.getTime() + 86400000) : null;
    const limit = upper && old.$lt ? new Date(Math.min(upper.getTime(), old.$lt.getTime())) : upper || old.$lt;
    filter[field] = { ...(lower && { $gte: lower }), ...(limit && { $lt: limit }) };
  }
  return filter;
}
