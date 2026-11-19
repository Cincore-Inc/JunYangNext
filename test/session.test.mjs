import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

test("login, session validation, protected routes and logout", { timeout: 30000 }, async () => {
  const managerToken = `mock.${Buffer.from(JSON.stringify({ user_id: 77, username: "manager" })).toString("base64url")}.signature`;
  const profileToken = `mock.${Buffer.from(JSON.stringify({ user_id: 10, username: "old-name" })).toString("base64url")}.signature`;
  const core = createServer(async (req, res) => {
    if (req.url === "/api/account/login/" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body);
      res.writeHead(["test", "limited"].includes(input.username) && input.password === "test" ? 200 : 401, { "content-type": "application/json" });
      return res.end(JSON.stringify({ token: input.username === "limited" ? "limited-token" : "test-token" }));
    }
    if (req.url === "/api/account/mypermission/") {
      const token = req.headers.authorization;
      res.writeHead(["JWT test-token", "JWT limited-token", "JWT bill-only", "JWT project-role", "JWT staff-only", "JWT staff-list-only", "JWT item-only", "JWT certificate-only", "JWT salary-tax", "JWT salary-deduction", "JWT exam-only", "JWT exam-result-only", "JWT history-only", `JWT ${managerToken}`, `JWT ${profileToken}`].includes(token) ? 200 : 401, { "content-type": "application/json" });
      if (token === "JWT certificate-only") return res.end(JSON.stringify({ certificate_view: true, certificate_add: true }));
      if (token === "JWT staff-list-only") return res.end(JSON.stringify({ staff_view: true }));
      if (token === "JWT item-only") return res.end(JSON.stringify({ staff_view: true, staff_item: true }));
      if (token === "JWT history-only") return res.end(JSON.stringify({ staff_salarydetail: true, staff_insurancedetail: true }));
      if (token === "JWT exam-only") return res.end(JSON.stringify({ exam_view: true }));
      if (token === "JWT exam-result-only") return res.end(JSON.stringify({ exam_view: true, exam_exam_status: true }));
      if (token === "JWT salary-tax" || token === "JWT salary-deduction") return res.end(JSON.stringify({ salarydetail_view: true, salarydetail_change: true, [token === "JWT salary-tax" ? "salarydetail_deduction_change" : "salarydetail_commission_change"]: true }));
      return res.end(JSON.stringify(token === "JWT test-token" ? { user_view: true, group_view: true, project_file_upload: true, project_all_view: true, project_detail: true, project_bill_view: true, project_file_view: true, file_view: true, finance_view: true, staff_view: true, staff_add: true, staff_staff: true, staff_item: true, staff_insurancedetail: true, staff_insurancedetail_change: true, insurancedetail_download: true, salarydetail_view: true, salarydetail_change: true, salarydetail_deduction_change: true, salarydetail_commission_change: true, insurancedetail_view: true, staff_insurancedetail_change: true, insurancedetail_company_payproof: true, certificate_view: true, certificate_add: true, certificate_cert_status_change: true, exam_view: true, exam_exam_status: true, exam_cert_status: true } : token === "JWT staff-only" ? { staff_staff: true } : token === "JWT limited-token" ? { user_view: true } : token === `JWT ${managerToken}` ? { user_view: true } : token === "JWT bill-only" ? { project_bill_view: true } : token === "JWT project-role" ? { project_all_view: true, project_add: true, project_detail: true, project_file_delete: true } : {}));
    }
    if (req.url === "/media/staff/image/mock.png") { res.writeHead(200, { "content-type": "image/png" }); return res.end(Buffer.from([137,80,78,71,13,10,26,10])); }
    if (req.url === "/api/account/permission/") { res.writeHead(req.headers.authorization === "JWT test-token" ? 200 : 400, { "content-type": "application/json" }); return res.end(JSON.stringify({ view_permission: [{ id: 2, children: [] }] })); }
    if (req.url === "/api/account/group/") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify([{ id: 2, name: "Role", view_permission: [{ id: 2, label: "项目", children: [] }], permissions: [2] }])); }
    if (req.url === "/api/account/user/" && req.method === "GET") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify([{ id: 1, username: "person", password: "mock-secret", name: "Test", is_active: true, group: [] }])); }
    if (["/api/account/user/1/", "/api/account/group/2/"].includes(req.url) && req.method === "DELETE") { res.writeHead(200, { "content-type": "application/json" }); return res.end('{}'); }
    if (req.url?.startsWith('/api/staff/salarydetail/') || req.url?.startsWith('/api/staff/insurancedetail/') || req.url?.startsWith('/api/staff/cert/')) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ count: 1, results: [{ id: 1, staff: 10, staff_name: 'Person', salary: 5000, private_field: 'private' }] })); }
    if (req.url === '/api/staff/insurancedetail-img-update/' && req.method === 'POST') { for await (const _ of req) { void _; } res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{}'); }
    if (req.url === "/api/account/user/1/" && req.method === "PATCH") { let body = ""; for await (const chunk of req) body += chunk; const data = JSON.parse(body); assert.deepEqual(data, { username: "changed", is_active: false }); res.writeHead(200, { "content-type": "application/json" }); return res.end('{}'); }
    if (req.url?.startsWith("/api/staff/staff/")) {
      res.writeHead(200, { "content-type": "application/json" });
      if (req.method === "POST" || req.method === "PATCH") { let body = ""; for await (const chunk of req) body += chunk; const data = JSON.parse(body); assert.equal(data.name, "New Person"); assert.equal(data.salary, req.method === "POST" ? 5000 : undefined); return res.end('{}'); }
      if (req.url === "/api/staff/staff/1/") return res.end(JSON.stringify({ name: "Test", phone: "123", id_card: "private-id", salary: 123 }));
      return res.end(JSON.stringify({ count: 1, results: [{ id: 1, name: "Test", companyname: "Company", id_card: "private-id", salary: 123 }] }));
    }
    if (req.url?.startsWith("/api/company/companys/")) {
      if (req.method === "GET") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ count: 1, results: [{ id: 1, name: "Test company", tags_txt_list: [] }] })); }
      if (["POST", "PATCH", "DELETE"].includes(req.method)) { for await (const _ of req) { void _; } res.writeHead(req.method === "DELETE" ? 204 : 200); return res.end(); }
    }
    if (req.url === "/api/account/staffname/") {
      res.writeHead(["JWT test-token", "JWT limited-token", "JWT staff-list-only", `JWT ${profileToken}`, `JWT ${managerToken}`].includes(req.headers.authorization) ? 200 : 401);
      return res.end("[]");
    }
    res.writeHead(404); res.end();
  });
  core.listen(0, "127.0.0.1");
  await once(core, "listening");
  const coreUrl = `http://127.0.0.1:${core.address().port}`;
  const port = 3101;
  const base = `http://127.0.0.1:${port}`;
  const server = spawn("./node_modules/.bin/next", ["start", "--hostname", "127.0.0.1", "--port", String(port)], { env: { ...process.env, LEGACY_CORE_URL: coreUrl, JUNYANG_AUTH_MODE: "legacy", JUNYANG_MYSQL_URL: "mysql://test", ALI_KEY_ID: "test", ALI_SECRECT: "test-secret", ALI_OOS_BUCKET_NAME: "junyang-files-hangzhou", NODE_OPTIONS: `--require=${process.cwd()}/test/mysql-shim.cjs --require=${process.cwd()}/test/oss-shim.cjs` }, stdio: "ignore" });
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try { await fetch(`${base}/login`); ready = true; break; } catch { await delay(100); }
    }
    assert.ok(ready, "test server started");
    for (const route of ["/api/projects", "/api/projects/bad", "/api/finance", "/api/attachments"]) {
      assert.equal((await fetch(base + route)).status, 401);
      assert.equal((await fetch(base + route, { headers: { cookie: "junyang_session=forged" } })).status, 401);
    }
    const limited = await fetch(`${base}/api/session`, { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify({ username: "limited", password: "test" }) });
    const limitedCookie = limited.headers.get("set-cookie").split(";")[0];
    for (const route of ["/api/projects", "/api/finance", "/api/files", "/api/staff"]) assert.equal((await fetch(base + route, { headers: { cookie: limitedCookie } })).status, 403);
    for (const route of ['/api/finance?kind=receipts', '/api/finance?kind=invoices&projectId=invalid', '/api/finance?kind=transactions&projectId=000000000000000000000001', '/api/finance/summary?mode=invoiceMatrix&kind=receipts']) assert.equal((await fetch(base + route, { headers: { cookie: 'junyang_session=bill-only' } })).status, 403);
    const syncName = (cookie) => fetch(`${base}/api/projects/invalid/sync-name`, { method: "POST", headers: { cookie, origin: base } });
    assert.equal((await syncName("junyang_session=project-role")).status, 400);
    assert.equal((await syncName("junyang_session=limited-token")).status, 403);
    assert.equal((await syncName("")).status, 401);
    const roleHeaders = { cookie: "junyang_session=project-role", origin: base, "content-type": "application/json" };
    assert.equal((await fetch(`${base}/api/projects`, { method: "POST", headers: roleHeaders, body: "{}" })).status, 400);
    assert.equal((await fetch(`${base}/api/projects/invalid`, { method: "PATCH", headers: roleHeaders, body: "{}" })).status, 400);
    assert.equal((await fetch(`${base}/api/projects/invalid/companies`, { method: "POST", headers: roleHeaders, body: "{}" })).status, 400);
    assert.equal((await fetch(`${base}/api/projects/invalid/attachments`, { method: "DELETE", headers: roleHeaders, body: "{}" })).status, 400);
    assert.equal((await fetch(`${base}/api/projects/invalid/attachments`, { method: "DELETE", headers: { ...roleHeaders, cookie: "junyang_session=limited-token" }, body: "{}" })).status, 403);
    const transactionAttachment = await fetch(`${base}/api/attachments?kind=transactions&field=receipt&id=000000000000000000000001`, { headers: { cookie: "junyang_session=bill-only" } });
    assert.equal(transactionAttachment.status, 403);
    const rejected = await fetch(`${base}/api/session`, { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify({ username: "test", password: "wrong" }) });
    assert.equal(rejected.status, 401);
    assert.equal(rejected.headers.get("set-cookie"), null);
    const login = await fetch(`${base}/api/session`, { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify({ username: "test", password: "test" }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie");
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=strict/i);
    const auth = { cookie: cookie.split(";")[0] };
    const adminUsers = await (await fetch(`${base}/api/users`, { headers: auth })).json(); assert.equal(adminUsers.users[0].password, 'mock-secret'); assert.equal(adminUsers.users[0].lastLogin, '2026-11-19T01:30:00Z');
    const companies = await (await fetch(`${base}/api/companies`, { headers: auth })).json(); assert.equal(companies.items[0].name, "Test company");
    assert.deepEqual((await (await fetch(`${base}/api/companies?options=tags`, { headers: auth })).json()).tags, ['Existing Tag', 'Another Tag']);
    assert.equal((await fetch(`${base}/api/companies?options=tags`)).status, 401);
    assert.equal((await (await fetch(`${base}/api/companies?q=Test&pageSize=50`, { headers: auth })).json()).total, 1);
    assert.equal((await (await fetch(`${base}/api/companies?q=Missing`, { headers: auth })).json()).total, 0);
    assert.equal((await fetch(`${base}/api/companies?pageSize=999`, { headers: auth })).status, 400);
    const expectedCompany = { name: "Test company", short_name: null, credit_code: null, address: null, legal_person: null, legal_person_code: null, phone: null, license_info: null, remark: null, report_deadline: null, rank: null, tags_txt_list: [] };
    const companyConflict = await fetch(`${base}/api/companies`, { method: "PATCH", headers: { ...auth, origin: base, "content-type": "application/json" }, body: JSON.stringify({ id: 1, name: "Test company", expected: { ...expectedCompany, name: "Stale" } }) }); assert.equal(companyConflict.status, 409);
    const tagConflict = await fetch(`${base}/api/companies`, { method: "PATCH", headers: { ...auth, origin: base, "content-type": "application/json" }, body: JSON.stringify({ id: 1, name: "Test company", expected: { ...expectedCompany, tags_txt_list: ["Stale"] } }) }); assert.equal(tagConflict.status, 409);
    for (const method of ["POST", "PATCH", "DELETE"]) { const companyResult = await fetch(`${base}/api/companies`, { method, headers: { ...auth, origin: base, "content-type": "application/json" }, body: JSON.stringify({ id: 1, name: "Test company", tags: [], expected: expectedCompany }) }); assert.equal(companyResult.status, 200); }
    const afterDeletion = await (await fetch(`${base}/api/companies`, { headers: auth })).json(); assert.equal(afterDeletion.total, 0); assert.equal(afterDeletion.items.length, 0);
    assert.equal((await fetch(`${base}/api/companies`, { method: 'DELETE', headers: { ...auth, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ id: 1 }) })).status, 409);
    assert.equal((await fetch(`${base}/api/companies`, { method: 'PATCH', headers: { ...auth, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ id: 1, name: 'Test company', expected: expectedCompany }) })).status, 409);
    assert.equal((await fetch(`${base}/api/companies`, { method: 'DELETE', headers: { ...auth, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ id: 999 }) })).status, 404);
    assert.equal((await fetch(`${base}/api/companies`, { method: 'DELETE', headers: { cookie: limitedCookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ id: 1 }) })).status, 403);
    assert.equal((await fetch(`${base}/api/companies`, { method: "POST", headers: { cookie: limitedCookie, origin: base, "content-type": "application/json" }, body: JSON.stringify({ name: "Test" }) })).status, 403);
    const managerUsers = await (await fetch(`${base}/api/users`, { headers: { cookie: `junyang_session=${managerToken}` } })).json(); assert.equal(managerUsers.users[0].password, "mock-secret");
    const limitedUsers = await (await fetch(`${base}/api/users`, { headers: { cookie: limitedCookie } })).json(); assert.equal('password' in limitedUsers.users[0], false);
    assert.equal((await fetch(`${base}/api/session`, { headers: auth })).status, 200);
    const profile = await (await fetch(`${base}/api/session`, { headers: { cookie: `junyang_session=${profileToken}` } })).json(); assert.equal(profile.username, "profile-user"); assert.equal(profile.name, "Profile Person");
    const managerProfile = await (await fetch(`${base}/api/session`, { headers: { cookie: `junyang_session=${managerToken}` } })).json(); assert.equal(managerProfile.administrator, true); assert.equal(managerProfile.canManageRoles, true);
    const managerCatalog = await fetch(`${base}/api/groups?catalog=1`, { headers: { cookie: `junyang_session=${managerToken}` } }); assert.equal(managerCatalog.status, 200);
    const managerRole = await fetch(`${base}/api/groups`, { method: "POST", headers: { cookie: `junyang_session=${managerToken}`, origin: base, "content-type": "application/json" }, body: JSON.stringify({ id: 2, name: "Role", expectedName: "Role", permissions: [2], expectedPermissions: [2, 99] }) }); assert.equal(managerRole.status, 200);
    assert.equal((await fetch(`${base}/api/groups?catalog=1`, { headers: { cookie: limitedCookie } })).status, 403);
    assert.equal((await fetch(`${base}/api/staff?from=2026-02-30&to=2026-03-01`, { headers: auth })).status, 400);
    assert.equal((await fetch(`${base}/api/staff?from=2026-03-01&to=2026-02-01`, { headers: auth })).status, 400);
    assert.equal((await fetch(`${base}/api/staff?insurance=invalid`, { headers: auth })).status, 400);
    assert.equal((await fetch(`${base}/api/staff?insurance=FULL&from=2021-01-01&to=2022-12-31`, { headers: auth })).status, 200);
    for (const [query, dateParam] of [['StaffFrom','from'],['StaffTo','to']]) { const params = new URLSearchParams({q:query,status:'__unset__',insurance:'__unset__',[dateParam]:'2026-11-19'}); const result = await fetch(`${base}/api/staff?${params}`, {headers:auth}); assert.equal(result.status,200); assert.equal((await result.json()).items[0].id,52); }
    assert.equal((await fetch(`${base}/api/staff?insurance=__unset__`, { headers: { cookie: limitedCookie } })).status,403);
    const staffMulti = new URLSearchParams({ q: 'MultiStaff', status: JSON.stringify(['ON','OFF','__unset__']), insurance: JSON.stringify(['NULL','FULL','__unset__']), from: '2026-01-01', to: '2026-12-31', pageSize: '10' });
    const staffMultiResult = await fetch(`${base}/api/staff?${staffMulti}`, { headers: auth }); assert.equal(staffMultiResult.status, 200); assert.equal((await staffMultiResult.json()).items[0].id, 53);
    assert.equal((await fetch(`${base}/api/staff?${staffMulti}`, { headers: { cookie: 'junyang_session=staff-list-only' } })).status, 403);
    for (const value of ['[]','[\"bad\"]','[1]']) assert.equal((await fetch(`${base}/api/staff?status=${encodeURIComponent(value)}`, { headers: auth })).status, 400);
    const staff = await fetch(`${base}/api/staff`, { headers: auth });
    assert.equal(staff.status, 200);
    const staffResult = await staff.json();
    assert.equal(staffResult.items[0].name, "Test");
    assert.equal("id_card" in staffResult.items[0], false);
    assert.equal(staffResult.items[0].salary, 123);
    const certificateOnly = { cookie: "junyang_session=certificate-only" };
    const staffOptions = await fetch(`${base}/api/staff/options?q=Person`, { headers: certificateOnly });
    assert.equal(staffOptions.status, 200); assert.deepEqual((await staffOptions.json()).items, [{ id: 10, name: "Person" }]);
    assert.equal((await fetch(`${base}/api/staff`, { headers: certificateOnly })).status, 403);
    assert.equal((await fetch(`${base}/api/staff/options`, { headers: { cookie: limitedCookie } })).status, 403);
    assert.equal((await fetch(`${base}/api/staff/options`)).status, 401);
    const detail = await (await fetch(`${base}/api/staff/write?id=1`, { headers: auth })).json();
    assert.equal(detail.name, "Test"); assert.equal(detail.salary, 123); assert.equal("id_card" in detail, false);
    const restrictedDetail = await (await fetch(`${base}/api/staff/write?id=1`, { headers: { cookie: "junyang_session=staff-only" } })).json(); assert.equal("salary" in restrictedDetail, false);
    const person = { name: "New Person", phone: "123", position: "资料员", entrydate: "2026-11-01", staff_status: "ON", salary: 5000, percentage: 5 };
    const staffExpected = (id) => ({ name: id === 2 ? "New Person" : "Old Person", phone: "123", position: "资料员", entrydate: "2026-11-01", staff_status: "ON", salary: 5000, percentage: 5 });
    const write = (payload, headers = auth) => fetch(`${base}/api/staff/write`, { method: "POST", headers: { ...headers, origin: base, "content-type": "application/json" }, body: JSON.stringify(payload.id ? { expected: staffExpected(payload.id), ...payload } : payload) });
    assert.equal((await write(person, { cookie: limitedCookie })).status, 403);
    assert.equal((await write({ ...person, salary: -1 })).status, 400);
    assert.equal((await write({ ...person, name: "Duplicate" })).status, 409);
    assert.equal((await write({ ...person, id: 999 })).status, 404);
    assert.equal((await write(person)).status, 200);
    assert.equal((await write({ ...person, id: 1 }, { cookie: "junyang_session=staff-only" })).status, 403);
    assert.equal((await write({ ...person, id: 1 })).status, 200);
    assert.equal((await write({ ...person, id: 1, expected: { ...staffExpected(1), phone: "stale" } })).status, 409);
    assert.equal((await write({ ...person, id: 1, expected: { ...staffExpected(1), salary: 123 } })).status, 409);
    assert.equal((await write({ id: 1, name: "New Person", phone: "123", position: "资料员", entrydate: "2026-11-01", staff_status: "ON" }, { cookie: "junyang_session=staff-only" })).status, 200);
    assert.equal((await write({ ...person, id: 2 })).status, 200);
    assert.equal((await write({ ...person, id: 1, salary: null, percentage: null })).status, 200);
    assert.equal((await write({ name: "New Person", id: 1, phone: "", position: "", entrydate: null, staff_status: null })).status, 200);
    assert.equal((await write({ ...person, id: 1, entrydate: "2026-02-30" })).status, 400);
    assert.equal((await write({ ...person, phone: "" })).status, 400);
    const listSalary = await (await fetch(`${base}/api/personnel?kind=salary`, { headers: auth })).json();
    const staffPage = await fetch(`${base}/api/staff?q=StaffPagination&page=2&pageSize=50`, { headers: auth }); assert.equal(staffPage.status, 200); assert.equal((await staffPage.json()).items[0].id, 51);
    assert.equal((await fetch(`${base}/api/staff?pageSize=100`, { headers: auth })).status, 400);
    const staffInsurance = await fetch(`${base}/api/staff/insurance?id=71`, { headers: auth }); assert.equal(staffInsurance.status, 200); assert.equal((await staffInsurance.json()).insure_pay, 'HALF');
    assert.equal((await fetch(`${base}/api/staff/insurance?id=71`, { headers: { cookie: limitedCookie } })).status, 403);
    const insuranceSettings = { id: 71, insure_pay: 'HALF-D', company_pay: '120', persenal_pay: '50', persenal_pay_D: '30', expected: { insure_pay: 'HALF', company_pay: 100, persenal_pay: 50, persenal_pay_D: null } };
    const updateStaffInsurance = (payload, headers = auth) => fetch(`${base}/api/staff/insurance`, { method: 'PATCH', headers: { ...headers, origin: base, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal((await updateStaffInsurance({ id: 72, insure_pay: null, company_pay: '120', persenal_pay: null, persenal_pay_D: null, expected: { insure_pay: null, company_pay: 100, persenal_pay: null, persenal_pay_D: null } })).status, 200);
    assert.equal((await updateStaffInsurance(insuranceSettings, { cookie: limitedCookie })).status, 403);
    assert.equal((await updateStaffInsurance({ ...insuranceSettings, company_pay: '-1' })).status, 400);
    assert.equal((await updateStaffInsurance({ ...insuranceSettings, expected: { ...insuranceSettings.expected, company_pay: 90 } })).status, 409);
    assert.equal((await updateStaffInsurance(insuranceSettings)).status, 200);
    const historyHeaders = { cookie: 'junyang_session=history-only' };
    const history = await fetch(`${base}/api/staff/history?kind=salary&id=71&month=2026-11&page=2&pageSize=50`, { headers: historyHeaders }); assert.equal(history.status, 200); assert.equal((await history.json()).items[0].salary, 5000);
    const insuranceHistory = await fetch(`${base}/api/staff/history?kind=insurance&id=71`, { headers: historyHeaders }); assert.equal(insuranceHistory.status, 200); assert.equal((await insuranceHistory.json()).items[0].company_payproof, true);
    assert.equal((await fetch(`${base}/api/staff/history?kind=salary&id=71`, { headers: { cookie: limitedCookie } })).status, 403);
    assert.equal((await fetch(`${base}/api/staff/history?kind=salary&id=71&month=2026-13`, { headers: historyHeaders })).status, 400);
    assert.equal((await fetch(`${base}/api/personnel/insurance-file?id=1&field=company_payproof`, { headers: historyHeaders })).status, 200);
    assert.equal(listSalary.items[0].salary, 5000); assert.equal('private_field' in listSalary.items[0], false);
    const salaryPage = await fetch(`${base}/api/personnel?kind=salary&q=Pagination&page=2&pageSize=50`, { headers: auth });
    assert.equal(salaryPage.status, 200); assert.equal((await salaryPage.json()).items[0].id, 51);
    assert.equal((await fetch(`${base}/api/personnel?kind=salary&pageSize=100`, { headers: auth })).status, 400);
    const insurancePage = await fetch(`${base}/api/personnel?kind=insurance&q=InsuranceCheck&month=2026-11&status=ON&insurePay=HALF&sort=asc&page=2&pageSize=30`, { headers: auth });
    assert.equal(insurancePage.status, 200); assert.equal((await insurancePage.json()).items[0].id, 72);
    for (const query of ['kind=insurance&status=UNSET&insurePay=UNSET', 'kind=certificates&status=UNSET&sure=UNSET', 'kind=exams&examStatus=UNSET&certStatus=UNSET']) {
      const result = await fetch(`${base}/api/personnel?${query}&q=UnsetFilter`, { headers: auth }); assert.equal(result.status, 200); assert.equal((await result.json()).items[0].id, 98);
    }
    assert.equal((await fetch(`${base}/api/personnel?kind=exams&examStatus=UNSET`, { headers: { cookie: 'junyang_session=exam-only' } })).status, 403);
    for (const query of [new URLSearchParams({kind:'insurance',status:'[\"ON\",\"OFF\",\"UNSET\"]',insurePay:'[\"FULL\",\"NULL\",\"UNSET\"]'}), new URLSearchParams({kind:'certificates',status:'[\"ON\",\"OFF\",\"UNSET\"]',sure:'[\"ON\",\"OFF\",\"UNSET\"]'}), new URLSearchParams({kind:'exams',examStatus:'[\"ON\",\"OFF\",\"UNSET\"]',certStatus:'[\"ON\",\"OFF\",\"UNSET\"]'})]) { query.set('q','MultiPersonnel'); const response=await fetch(`${base}/api/personnel?${query}`, {headers:auth});assert.equal(response.status,200);assert.equal((await response.json()).items[0].id,97); }
    assert.equal((await fetch(`${base}/api/personnel?kind=insurance&status=%5B%5D`, {headers:auth})).status,400);
    assert.equal((await fetch(`${base}/api/personnel?kind=exams&examStatus=%5B%22ON%22%2C%22OFF%22%5D`, {headers:{cookie:'junyang_session=exam-only'}})).status,403);
    for (const query of ['insurePay=bad', 'sort=bad', 'pageSize=50']) assert.equal((await fetch(`${base}/api/personnel?kind=insurance&${query}`, { headers: auth })).status, 400);
    for (const kind of ['exams', 'certificates']) for (const side of ['from', 'to']) { const response = await fetch(`${base}/api/personnel?kind=${kind}&q=OneSide${side === 'to' ? 'To' : 'From'}&${side}=2026-11-19`, { headers: auth }); assert.equal(response.status, 200); assert.equal((await response.json()).items[0].id, 99); }
    const examsPage = await fetch(`${base}/api/personnel?kind=exams&q=ExamPerson&examName=ExamName&examStatus=ON&certStatus=OFF&dateField=cert_date&from=2026-11-01&to=2026-11-30&page=2&pageSize=40`, { headers: auth });
    assert.equal(examsPage.status, 200); assert.equal((await examsPage.json()).items[0].id, 74);
    for (const [token, expectedExam, expectedCert] of [['exam-only', '', ''], ['exam-result-only', 'ON', ''], ['test-token', 'ON', 'OFF']]) {
      const response = await fetch(`${base}/api/personnel?kind=exams&q=PrivacyExam`, { headers: { cookie: `junyang_session=${token}` } });
      assert.equal(response.status, 200); const item = (await response.json()).items[0];
      assert.equal(item.exam_status, expectedExam); assert.equal(item.cert_status, expectedCert);
    }
    for (const filter of ['examStatus=ON', 'certStatus=OFF']) assert.equal((await fetch(`${base}/api/personnel?kind=exams&${filter}`, { headers: { cookie: 'junyang_session=exam-only' } })).status, 403);
    for (const query of ['dateField=bad', 'from=2026-02-30&to=2026-03-01', 'pageSize=50']) assert.equal((await fetch(`${base}/api/personnel?kind=exams&${query}`, { headers: auth })).status, 400);
    for (const query of ['orderBy=exam_date&orderDirection=asc', 'orderBy=cert_date&orderDirection=desc']) { const sorted = await fetch(`${base}/api/personnel?kind=exams&q=ExamSort&${query}`, { headers: auth }); assert.equal(sorted.status, 200); assert.equal((await sorted.json()).items[0].id, 75); }
    for (const query of ['orderBy=id', 'orderDirection=bad']) assert.equal((await fetch(`${base}/api/personnel?kind=exams&${query}`, { headers: auth })).status, 400);
    for (const field of ['cert_start_date', 'cert_end_date', 'cert_next_date']) for (const direction of ['asc', 'desc']) { const sorted = await fetch(`${base}/api/personnel?kind=certificates&q=CertSort&page=2&pageSize=30&orderBy=${field}&orderDirection=${direction}`, { headers: auth }); assert.equal(sorted.status, 200); assert.equal((await sorted.json()).items[0].id, 76); }
    for (const query of ['orderBy=id', 'orderDirection=bad', 'pageSize=50']) assert.equal((await fetch(`${base}/api/personnel?kind=certificates&${query}`, { headers: auth })).status, 400);
    for (const kind of ['certificates', 'exams']) { const result = await fetch(`${base}/api/personnel?kind=${kind}&staffId=71`, { headers: auth }); assert.equal(result.status, 200); assert.equal((await result.json()).items[0].staff, 71); }
    assert.equal((await fetch(`${base}/api/personnel?kind=exams&staffId=bad`, { headers: auth })).status, 400);
    assert.equal((await fetch(`${base}/api/personnel?kind=certificates&staffId=71`, { headers: { cookie: limitedCookie } })).status, 403);
    assert.equal((await fetch(`${base}/api/personnel?kind=certificates&from=2026-02-30&to=2026-03-01`, { headers: auth })).status, 400);
    assert.equal((await fetch(`${base}/api/personnel?kind=salary`, { headers: { cookie: limitedCookie } })).status, 403);
    const updateDetail = (payload, headers = auth) => fetch(`${base}/api/personnel`, { method: "PATCH", headers: { ...headers, origin: base, "content-type": "application/json" }, body: JSON.stringify(payload) });
    const salary = { kind: 'salary', id: 1, personal_tax: '0', deduction: '10.50', expected: { personal_tax: null, deduction: 0 } };
    assert.equal((await updateDetail(salary, { cookie: limitedCookie })).status, 403);
    assert.equal((await updateDetail({ ...salary, deduction: '-1' })).status, 400);
    assert.equal((await updateDetail(salary)).status, 200);
    assert.equal((await updateDetail({ ...salary, id: 999 })).status, 409);
    const taxOnly = { kind: 'salary', id: 72, personal_tax: '0', expected: { personal_tax: null } };
    const deductionOnly = { kind: 'salary', id: 73, deduction: '10.50', expected: { deduction: 0 } };
    assert.equal((await updateDetail(taxOnly, { cookie: 'junyang_session=salary-tax' })).status, 200);
    assert.equal((await updateDetail(deductionOnly, { cookie: 'junyang_session=salary-deduction' })).status, 200);
    assert.equal((await updateDetail(deductionOnly, { cookie: 'junyang_session=salary-tax' })).status, 403);
    assert.equal((await updateDetail(taxOnly, { cookie: 'junyang_session=salary-deduction' })).status, 403);
    assert.equal((await updateDetail(salary, { cookie: 'junyang_session=salary-tax' })).status, 403);
    assert.equal((await updateDetail({ kind: 'salary', id: 1, expected: {} })).status, 400);
    const insurance = { kind: 'insurance', id: 1, company_pay: '100.00', persenal_pay: '0', persenal_pay_D: '30', insure_status: 'ON', insure_pay: 'FULL', expected: { company_pay: null, persenal_pay: 0, persenal_pay_D: 0, insure_status: null, insure_pay: null } };
    assert.equal((await updateDetail(insurance)).status, 200);
    const insuranceDates = { ...insurance, id: 71, company_pay_date: '2026-11-15', persenal_pay_date: '', expected: { ...insurance.expected, company_pay_date: '2026-11-01', persenal_pay_date: '2026-11-02' } };
    assert.equal((await updateDetail(insuranceDates, { cookie: limitedCookie })).status, 403);
    assert.equal((await updateDetail({ ...insuranceDates, company_pay_date: '2026-02-30' })).status, 400);
    assert.equal((await updateDetail({ ...insuranceDates, expected: insurance.expected })).status, 400);
    assert.equal((await updateDetail(insuranceDates)).status, 200);
    assert.equal((await updateDetail({ ...insuranceDates, id: 999 })).status, 409);
    const proof = new FormData(); proof.set('id', '1'); proof.set('field', 'company_payproof'); proof.set('file', new Blob([Buffer.from([137,80,78,71,13,10,26,10])], { type: 'image/png' }), 'proof.png');
    assert.equal((await fetch(`${base}/api/personnel/insurance-file`, { method: 'POST', headers: { ...auth, origin: 'http://bad.invalid' }, body: proof })).status, 403);
    assert.equal((await fetch(`${base}/api/personnel/insurance-file`, { method: 'POST', headers: { cookie: limitedCookie, origin: base }, body: proof })).status, 403);
    assert.equal((await fetch(`${base}/api/personnel/insurance-file`, { method: 'POST', headers: { ...auth, origin: base }, body: proof })).status, 200);
    const postJson = (route, payload, headers = auth) => fetch(`${base}${route}`, { method: 'POST', headers: { ...headers, origin: base, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const batch = { action: 'update', records: [{ id: 1, status: 'OFF', nextDate: null }], status: 'ON', nextDate: '' };
    assert.equal((await postJson('/api/personnel/certificate-batch', { action: 'update', records: [{ id: 2, status: 'ON_HALF', nextDate: null }], status: 'OFF_HALF', nextDate: '' })).status, 200);
    assert.equal((await postJson('/api/personnel/certificate-batch', { action: 'update', records: [{ id: 2, status: 'ON_HALF', nextDate: null }], status: 'bad', nextDate: '' })).status, 400);
    assert.equal((await postJson('/api/personnel/certificate-batch', batch, { cookie: limitedCookie })).status, 403);
    assert.equal((await postJson('/api/personnel/certificate-batch', batch)).status, 200);
    assert.equal((await postJson('/api/personnel/certificate-batch', { ...batch, records: [{ id: 1, status: 'ON', nextDate: null }] })).status, 409);
    const download = await postJson('/api/personnel/insurance-download', { ids: [1, 2, 6] });
    assert.equal(download.status, 200);
    const zip = await JSZip.loadAsync(await download.arrayBuffer()); assert.ok(zip.file('测试_人员-2026-11-1-社保凭证.png')); assert.ok(zip.file('测试_人员-2026-11-2-社保凭证.webp')); assert.ok(zip.file('人员未设置-月份未设置-6-个人转账凭证.png'));
    assert.equal((await postJson('/api/personnel/insurance-download', { ids: [1] }, { cookie: limitedCookie })).status, 403);
    const itemOnly = { cookie: "junyang_session=item-only" };
    assert.equal((await fetch(`${base}/api/personnel/staff-assets?staff=10&kind=itemlist`, { headers: itemOnly })).status, 200);
    assert.equal((await fetch(`${base}/api/personnel/staff-assets?staff=10&kind=staff`, { headers: itemOnly })).status, 403);
    assert.equal((await fetch(`${base}/api/personnel/staff-image?staff=10&id=1&kind=itemlist`, { headers: itemOnly })).status, 200);
    assert.equal((await fetch(`${base}/api/personnel/staff-image?staff=10&id=1&kind=staff`, { headers: itemOnly })).status, 403);
    assert.equal((await fetch(`${base}/api/personnel/staff-assets`, { method: 'PATCH', headers: { ...itemOnly, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ staff: 10, item: 'new', expected: 'old' }) })).status, 200);
    assert.equal((await fetch(`${base}/api/personnel/staff-assets?staff=10&kind=itemlist`, { headers: { cookie: 'junyang_session=staff-only' } })).status, 403);
    const personPicture = new FormData(); personPicture.set('staff', '10'); personPicture.set('kind', 'staff'); personPicture.set('file', new Blob([Buffer.from([137,80,78,71,13,10,26,10])], { type: 'image/png' }), 'staff.png');
    assert.equal((await fetch(`${base}/api/personnel/staff-assets`, { method: 'POST', headers: { ...auth, origin: base }, body: personPicture })).status, 200);
    const picture = await fetch(`${base}/api/personnel/staff-image?staff=10&id=1&kind=staff`, { headers: auth }); assert.equal(picture.status, 200); assert.equal(picture.headers.get('content-type'), 'image/png');
    const proofPreview = await fetch(`${base}/api/personnel/insurance-file?id=1&field=company_payproof`, { headers: auth }); assert.equal(proofPreview.status, 200); assert.equal(proofPreview.headers.get('content-type'), 'image/png');
    const deleteImage = (staff, id, headers = auth) => fetch(`${base}/api/personnel/staff-assets?staff=${staff}&kind=staff&id=${id}`, { method: 'DELETE', headers: { ...headers, origin: base } });
    assert.equal((await deleteImage(10, 1, { cookie: limitedCookie })).status, 403);
    assert.equal((await deleteImage(11, 1)).status, 404);
    assert.equal((await deleteImage(10, 1)).status, 200);
    assert.equal((await deleteImage(10, 1)).status, 409);
    assert.equal((await fetch(`${base}/api/personnel/staff-image?staff=10&id=1&kind=staff`, { headers: auth })).status, 404);
    assert.equal((await (await fetch(`${base}/api/personnel/staff-assets?staff=10&kind=staff`, { headers: auth })).json()).images.length, 0);
    const saveItems = (expected) => fetch(`${base}/api/personnel/staff-assets`, { method: 'PATCH', headers: { ...auth, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ staff: 10, item: 'new', expected }) });
    assert.equal((await saveItems('old')).status, 200); assert.equal((await saveItems('stale')).status, 409);
    const createDetail = (payload) => fetch(`${base}/api/personnel`, { method: 'POST', headers: { ...auth, origin: base, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const newSalary = { kind: 'salary', staff_id: 10, month: '2026-11', salary: '5000.00', personal_tax: '0', persenal_pay: '100', commission: '10', deduction: '20' };
    assert.equal((await createDetail(newSalary)).status, 200);
    assert.equal((await createDetail({ ...newSalary, staff_id: 11 })).status, 409);
    assert.equal((await createDetail({ ...newSalary, month: '2026-13' })).status, 400);
    assert.equal((await createDetail({ ...insurance, staff_id: 10, month: '2026-11' })).status, 200);
    const certificate = { staff_id: 10, cert_name: 'Test', cert_start_date: '2026-01-01', cert_end_date: '', cert_sure: 'ON', cert_next_date: '', cert_status: '' };
    const saveCertificate = (payload, headers = auth) => fetch(`${base}/api/personnel/certificate`, { method: 'POST', headers: { ...headers, origin: base, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal((await saveCertificate(certificate, { cookie: limitedCookie })).status, 403);
    assert.equal((await saveCertificate({ ...certificate, cert_start_date: '2026-02-30' })).status, 400);
    assert.equal((await saveCertificate(certificate)).status, 200);
    for (const certStatus of ['ON_HALF', 'OFF_HALF']) { assert.equal((await saveCertificate({ ...certificate, cert_status: certStatus })).status, 200); assert.equal((await fetch(`${base}/api/personnel?kind=certificates&status=${certStatus}`, { headers: auth })).status, 200); }
    assert.equal((await saveCertificate({ ...certificate, id: 1, expected: { cert_name: 'Old', cert_person_name: 'Person', cert_start_date: null, cert_end_date: null, cert_sure: 'ON', cert_next_date: null, cert_status: null, staff_id: 10 } })).status, 200);
    const exam = { exam_name: 'Exam', exam_person_name: 'Person', exam_date: '2026-11-19T10:00', exam_status: 'ON', cert_date: '', cert_status: '' };
    const saveExam = (payload, headers = auth) => fetch(`${base}/api/personnel/exam`, { method: 'POST', headers: { ...headers, origin: base, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal((await saveExam(exam, { cookie: limitedCookie })).status, 403);
    assert.equal((await saveExam({ ...exam, exam_date: '2026-02-30T10:00' })).status, 400);
    assert.equal((await saveExam(exam)).status, 200);
    assert.equal((await saveExam({ ...exam, staff_id: 71 })).status, 200);
    assert.equal((await saveExam({ ...exam, staff_id: 72 })).status, 409);
    const existingExam = { ...exam, id: 2, cert_status: 'OFF', expected: { exam_name: 'Exam', exam_person_name: 'Person', exam_date: '2026-11-19 10:00', exam_date_version: '2026-11-19 10:00:00.000000', exam_status: 'ON', cert_date: null, cert_date_version: null, cert_status: 'OFF', staff: null } };
    assert.equal((await saveExam(existingExam, { cookie: 'junyang_session=exam-only' })).status, 200);
    assert.equal((await saveExam({ ...existingExam, id: 77, exam_status: '', cert_status: '', expected: { ...existingExam.expected, exam_status: '', cert_status: '' } }, { cookie: 'junyang_session=exam-only' })).status, 200);
    assert.equal((await saveExam({ ...existingExam, exam_status: 'OFF' }, { cookie: 'junyang_session=exam-only' })).status, 403);
    assert.equal((await saveExam({ ...existingExam, cert_status: 'ON' }, { cookie: 'junyang_session=exam-only' })).status, 403);
    assert.equal((await postJson('/api/personnel/certificate-batch', { ...batch, action: 'delete' }, { cookie: limitedCookie })).status, 403);
    assert.equal((await postJson('/api/personnel/certificate-batch', { ...batch, action: 'delete' })).status, 200);
    assert.equal((await postJson('/api/personnel/certificate-batch', { ...batch, action: 'delete' })).status, 409);
    assert.equal((await postJson('/api/personnel/certificate-batch', batch)).status, 409);
    assert.equal((await saveCertificate({ ...certificate, id: 1, expected: { cert_name: 'Old', cert_person_name: 'Person', cert_start_date: null, cert_end_date: null, cert_sure: 'ON', cert_next_date: null, cert_status: null, staff_id: 10 } })).status, 409);
    const deleteExam = (id, headers = auth) => fetch(`${base}/api/personnel/exam?id=${id}`, { method: 'DELETE', headers: { ...headers, origin: base } });
    assert.equal((await deleteExam(91, { cookie: limitedCookie })).status, 403);
    assert.equal((await deleteExam(91, { cookie: 'junyang_session=exam-only' })).status, 200);
    assert.equal((await deleteExam(91, { cookie: 'junyang_session=exam-only' })).status, 409);
    assert.equal((await deleteExam(999)).status, 404);
    assert.equal((await deleteExam(1)).status, 200);
    assert.equal((await deleteExam(1)).status, 409);
    assert.equal((await saveExam({ ...exam, id: 1, expected: { exam_name: 'Exam', exam_person_name: 'Person', exam_date: '2026-11-19 10:00', exam_date_version: '2026-11-19 10:00:00.000000', exam_status: 'ON', cert_date: null, cert_date_version: null, cert_status: null, staff: 10 } })).status, 409);
    const editUser = (headers, expectedGroups = ["Role"]) => fetch(`${base}/api/users`, { method: "PATCH", headers: { ...headers, origin: base, "content-type": "application/json" }, body: JSON.stringify({ id: 1, username: "changed", password: "new-password", active: false, groupId: 2, expectedUsername: "before", expectedActive: true, expectedGroups }) });
    const preserveRoles = await fetch(`${base}/api/users`, { method: "PATCH", headers: { ...auth, origin: base, "content-type": "application/json" }, body: JSON.stringify({ id: 123, username: "changed", password: "new-password", active: false, expectedUsername: "before", expectedActive: true, expectedGroups: ["Role", "Other"] }) });
    assert.equal(preserveRoles.status, 200);
    assert.equal((await editUser({ cookie: limitedCookie })).status, 403);
    assert.equal((await editUser(auth)).status, 200);
    assert.equal((await editUser(auth, [])).status, 409);
    const createUser = (payload, headers = auth) => fetch(`${base}/api/users`, { method: "POST", headers: { ...headers, origin: base, "content-type": "application/json" }, body: JSON.stringify(payload) });
    const newUser = { username: "person", password: "test-password", staffId: 10, active: true, groupId: 2 };
    assert.equal((await createUser(newUser, { cookie: limitedCookie })).status, 403);
    assert.equal((await createUser({ ...newUser, password: "short" })).status, 400);
    assert.equal((await createUser({ ...newUser, staffId: 11 })).status, 409);
    assert.equal((await createUser(newUser)).status, 200);
    const remove = (kind, headers) => fetch(`${base}/api/account-delete?kind=${kind}&id=${kind === "user" ? 1 : 2}`, { method: "DELETE", headers: { ...headers, origin: base } });
    assert.equal((await remove("user", { cookie: limitedCookie })).status, 403);
    assert.equal((await remove("user", auth)).status, 400);
    assert.equal((await remove("group", auth)).status, 409);
    const saveGroup = (permissions, expectedPermissions) => fetch(`${base}/api/groups`, { method: "POST", headers: { ...auth, origin: base, "content-type": "application/json" }, body: JSON.stringify({ id: 2, name: "Role", expectedName: "Role", permissions, expectedPermissions }) });
    assert.equal((await saveGroup([2], [2, 99])).status, 200);
    const staleRole = await fetch(`${base}/api/groups`, { method: "POST", headers: { ...auth, origin: base, "content-type": "application/json" }, body: JSON.stringify({ id: 2, name: "修改角色", expectedName: "旧名称", permissions: [2], expectedPermissions: [2, 99] }) }); assert.equal(staleRole.status, 409);
    assert.equal((await saveGroup([2], [2])).status, 409);
    assert.equal((await saveGroup([99], [2, 99])).status, 400);
    const deleteRole = (id, headers = auth) => fetch(`${base}/api/account-delete?kind=group&id=${id}`, { method: 'DELETE', headers: { ...headers, origin: base } });
    assert.equal((await deleteRole(3, { cookie: limitedCookie })).status, 403);
    assert.equal((await deleteRole(999)).status, 404);
    assert.equal((await deleteRole(3)).status, 200);
    assert.equal((await deleteRole(3)).status, 409);
    assert.equal((await (await fetch(`${base}/api/groups`, {headers:auth})).json()).groups.some(g => g.id === 3), false);
    assert.equal((await createUser({ ...newUser, groupId: 3 })).status, 409);
    assert.equal((await fetch(`${base}/api/groups`, { method: 'POST', headers: { ...auth, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ id:3, name:'Empty role', expectedName:'Empty role', permissions:[2], expectedPermissions:[2,99] }) })).status, 409);

    assert.equal((await fetch(`${base}/api/projects/bad`, { headers: auth })).status, 400);
    const invalidFile = new FormData();
    invalidFile.set("id", "000000000000000000000001");
    invalidFile.set("kind", "receipts");
    invalidFile.set("file", new Blob(["invalid image"], { type: "image/png" }), "fake.png");
    const wrongOrigin = await fetch(`${base}/api/attachments/upload`, { method: "POST", headers: { ...auth, origin: "http://attacker.invalid" }, body: invalidFile });
    assert.equal(wrongOrigin.status, 403);
    const upload = await fetch(`${base}/api/attachments/upload`, { method: "POST", headers: { ...auth, origin: base }, body: invalidFile });
    assert.equal(upload.status, 404);
    const csrf = await fetch(`${base}/api/session`, { method: "DELETE", headers: { ...auth, origin: "http://attacker.invalid" } });
    assert.equal(csrf.status, 403);
    const logout = await fetch(`${base}/api/session`, { method: "DELETE", headers: { ...auth, origin: base } });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie"), /Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  } finally {
    server.kill("SIGTERM");
    await new Promise((resolve) => core.close(resolve));
  }
});
