import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import JSZip from 'jszip';

test('local authentication works without Core and enforces roles', { timeout: 30000 }, async () => {
  const base = 'http://127.0.0.1:3104';
  const server = spawn('./node_modules/.bin/next', ['start', '--hostname', '127.0.0.1', '--port', '3104'], { env: { ...process.env, JUNYANG_AUTH_MODE: 'local', JUNYANG_SESSION_SECRET: 'test-secret-at-least-thirty-two-characters', JUNYANG_MYSQL_URL: 'mysql://test', LEGACY_CORE_URL: 'http://127.0.0.1:1', ALI_KEY_ID: 'test', ALI_SECRECT: 'test-secret', ALI_OOS_BUCKET_NAME: 'junyang-files-hangzhou', NODE_OPTIONS: `--require=${process.cwd()}/test/mysql-shim.cjs --require=${process.cwd()}/test/oss-shim.cjs` }, stdio: 'ignore' });
  try {
    let ready = false; for (let i = 0; i < 60; i++) { try { await fetch(base + '/login'); ready = true; break; } catch { await delay(100); } }
    assert.ok(ready);
    const login = (username, password) => fetch(base + '/api/session', { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
    assert.equal((await login('localstaff', 'wrong')).status, 401);
    assert.equal((await login('disabled', 'secret-staff')).status, 401);
    const staff = await login('localstaff', 'secret-staff'); assert.equal(staff.status, 200);
    const cookie = staff.headers.get('set-cookie').split(';')[0]; assert.match(cookie, /^junyang_session=v1\./);
    const profile = await (await fetch(base + '/api/session', { headers: { cookie } })).json(); assert.equal(profile.administrator, false); assert.equal(profile.permissions.staff_view, true);
    assert.equal((await fetch(base + '/api/staff', { headers: { cookie } })).status, 200);
    assert.equal((await fetch(base + '/api/users', { headers: { cookie } })).status, 403);
    assert.equal((await fetch(base + '/api/session', { headers: { cookie: cookie + 'x' } })).status, 401);
    for (const endpoint of ['/api/session', '/api/staff', '/api/groups?catalog=1']) {
      const stale = await fetch(base + endpoint, { headers: { cookie: 'junyang_session=legacy-token' } });
      assert.equal(stale.status, 401);
    }
    const manager = await login('localadmin', 'secret-admin'); assert.equal(manager.status, 200);
    const managerCookie = manager.headers.get('set-cookie').split(';')[0];
    const certificateEdit = {id:75,staff_id:null,cert_name:'',cert_sure:null,cert_start_date:'',cert_end_date:'2026-11-19',cert_next_date:'',cert_status:'',expected:{staff_id:null,cert_name:null,cert_person_name:'历史姓名',cert_start_date:null,cert_end_date:null,cert_sure:null,cert_next_date:null,cert_status:null}};
    const editCertificate = (body) => fetch(base+'/api/personnel/certificate', {method:'POST',headers:{cookie:managerCookie,origin:base,'content-type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await editCertificate(certificateEdit)).status,200);
    assert.equal((await editCertificate({...certificateEdit,expected:{...certificateEdit.expected,cert_name:'已有证件'}})).status,400);
    assert.equal((await editCertificate({...certificateEdit,cert_sure:'invalid'})).status,400);
    const insuranceEdit = {kind:'insurance',id:74,company_pay:'',persenal_pay:'12.34',persenal_pay_D:'',insure_pay:null,insure_status:null,company_pay_date:'2026-11-19',expected:{company_pay:null,persenal_pay:12.34,persenal_pay_D:null,insure_pay:null,insure_status:null,company_pay_date:null}};
    const editInsurance = (body) => fetch(base+'/api/personnel', {method:'PATCH',headers:{cookie:managerCookie,origin:base,'content-type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await editInsurance(insuranceEdit)).status,200);
    assert.equal((await editInsurance({...insuranceEdit, company_pay:'', expected:{...insuranceEdit.expected,company_pay:10}})).status,400);
    assert.equal((await editInsurance({...insuranceEdit, insure_pay:'invalid'})).status,400);
    assert.equal((await editInsurance({...insuranceEdit,id:999})).status,409);
    assert.equal((await (await fetch(base + '/api/session', { headers: { cookie: managerCookie } })).json()).administrator, true);
    assert.equal((await fetch(base + '/api/groups?catalog=1', { headers: { cookie: managerCookie } })).status, 200);
    const exam = (values) => fetch(base + '/api/personnel/exam', { method: 'POST', headers: { cookie: managerCookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ exam_name: '', exam_person_name: '', exam_date: '', exam_status: '', cert_date: '', cert_status: '', ...values }) });
    assert.equal((await exam({})).status, 400);
    assert.equal((await exam({ exam_name: '仅名称' })).status, 200);
    assert.equal((await exam({ exam_person_name: 'Person' })).status, 200);
    assert.equal((await exam({ exam_date: '2026-11-19T10:30' })).status, 200);
    assert.equal((await exam({ exam_name: '考试', exam_date: '2026-02-30T10:30' })).status, 400);
    assert.equal((await exam({ id: 1, exam_name: '考试', expected: { exam_name: null, exam_person_name: null, exam_date: null, exam_date_version: null, exam_status: null, cert_date: null, cert_date_version: null, cert_status: null, staff: null } })).status, 200);
    assert.equal((await exam({ id:76,staff_id:10,exam_name:'新考试',exam_person_name:'旧姓名',exam_date:'2026-11-19T10:30',exam_status:'ON',cert_date:'2026-11-20T10:30',cert_status:'OFF',expected:{exam_name:'旧考试',exam_person_name:'旧姓名',exam_date:'2026-11-19 10:30',exam_date_version:'2026-11-19 10:30:27.000000',exam_status:'ON',cert_date:'2026-11-20 10:30',cert_date_version:'2026-11-20 10:30:55.000000',cert_status:'OFF',staff:10} })).status,200);
    assert.equal((await exam({ id:76,staff_id:10,exam_name:'修改时间',exam_person_name:'旧姓名',exam_date:'2026-11-19T11:30',exam_status:'ON',cert_date:'2026-11-20T10:30',cert_status:'OFF',expected:{exam_name:'旧考试',exam_person_name:'旧姓名',exam_date:'2026-11-19 10:30',exam_date_version:'2026-11-19 10:30:27.000000',exam_status:'ON',cert_date:'2026-11-20 10:30',cert_date_version:'2026-11-20 10:30:55.000000',cert_status:'OFF',staff:10} })).status,200);
    assert.equal((await exam({ id:76,staff_id:10,exam_name:'修改时间',exam_person_name:'旧姓名',exam_date:'2026-11-19T11:30',exam_status:'ON',cert_date:'2026-11-20T10:30',cert_status:'OFF',expected:{exam_name:'旧考试',exam_person_name:'旧姓名',exam_date:'2026-11-19 10:30',exam_date_version:'2026-11-19 10:30:28.000000',exam_status:'ON',cert_date:'2026-11-20 10:30',cert_date_version:'2026-11-20 10:30:55.000000',cert_status:'OFF',staff:10} })).status,409);
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aXYAAAAASUVORK5CYII=', 'base64');
    for (const [endpoint, fields] of [['/api/personnel/staff-assets', { staff: '10', kind: 'staff' }], ['/api/personnel/insurance-file', { id: '1', field: 'company_payproof' }]]) {
      const form = new FormData(); for (const [key, value] of Object.entries(fields)) form.set(key, value);
      form.set('file', new Blob([image], { type: 'image/png' }), 'test.png');
      assert.equal((await fetch(base + endpoint, { method: 'POST', headers: { cookie: managerCookie, origin: base }, body: form })).status, 200);
    }
    for (const endpoint of ['/api/personnel/staff-image?staff=10&id=1&kind=staff', '/api/personnel/insurance-file?id=1&field=company_payproof']) {
      const preview = await fetch(base + endpoint, { headers: { cookie: managerCookie } });
      assert.equal(preview.status, 200); assert.equal(preview.headers.get('content-type'), 'image/png'); assert.deepEqual(Buffer.from(await preview.arrayBuffer()), image);
      const download = await fetch(base + endpoint + '&download=1', { headers: { cookie: managerCookie } });
      assert.match(download.headers.get('content-disposition'), /^attachment/); assert.deepEqual(Buffer.from(await download.arrayBuffer()), image);
      assert.equal((await fetch(base + endpoint, { headers: { cookie } })).status, 403);
    }
    const archive = await fetch(base + '/api/personnel/insurance-download', { method: 'POST', headers: { cookie: managerCookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ ids: [1] }) });
    assert.equal(archive.status, 200); const zip = await JSZip.loadAsync(await archive.arrayBuffer()); assert.deepEqual(await zip.file('1-company.png').async('nodebuffer'), image);
  } finally { server.kill('SIGTERM'); }
});
