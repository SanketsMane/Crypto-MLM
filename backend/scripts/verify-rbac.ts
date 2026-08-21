import 'dotenv/config';
const API = 'http://localhost:4000/api/v1';

async function call(m: string, p: string, tok?: string, body?: unknown) {
  const res = await fetch(API + p, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}
const login = async (email: string, password: string) =>
  (await call('POST', '/admin/login', undefined, { email, password })).json?.data;

const check = (label: string, got: number, want: number) =>
  console.log(`  ${got === want ? 'PASS' : 'FAIL'}  ${label.padEnd(50)} ${got} (want ${want})`);

const su = await login('contactsanket1@gmail.com', 'Sanket@3030');
console.log(`=== signed in: ${su.admin.name} — ${su.admin.role.name} (level ${su.admin.role.level})`);
console.log(`    ${su.admin.permissions.length} permissions granted`);

console.log('\n=== roles defined in the database (not in code) ===');
const roles = (await call('GET', '/admin/roles', su.accessToken)).json.data;
for (const r of roles) {
  console.log(`  L${String(r.level).padStart(3)}  ${r.name.padEnd(20)} ${String(r.permissionIds.length).padStart(2)} perms  ${r.adminCount} admin(s)${r.isSystem ? '  [system]' : ''}`);
}

console.log('\n=== create a brand-new admin level, no deploy ===');
const created = await call('POST', '/admin/roles', su.accessToken, {
  name: 'Compliance Auditor', description: 'Read-only access to money movement and the audit trail.',
  level: 25, permissionKeys: ['dashboard.view', 'users.view', 'withdrawals.view', 'audit.view'],
});
check('role created', created.status, 201);
const newRoleId = created.json?.data?.id;

const newAdmin = await call('POST', '/admin/admins', su.accessToken, {
  email: `auditor${Date.now()}@fortunex.local`, name: 'Compliance Auditor',
  password: 'Auditor@12345', roleId: newRoleId,
});
check('admin created with that role', newAdmin.status, 201);
const auditorEmail = newAdmin.json?.data?.email;

const aud = await login(auditorEmail, 'Auditor@12345');
console.log(`  signed in as ${aud.admin.role.name} with ${aud.admin.permissions.length} permissions`);

console.log('\n=== the new role is enforced ===');
check('auditor CAN view withdrawals',  (await call('GET', '/admin/withdrawals', aud.accessToken)).status, 200);
check('auditor CAN view audit log',    (await call('GET', '/admin/audit', aud.accessToken)).status, 200);
check('auditor CANNOT approve payouts',(await call('POST', '/admin/withdrawals/x/approve', aud.accessToken)).status, 403);
check('auditor CANNOT adjust balances',(await call('POST', '/admin/users/x/adjust', aud.accessToken, { walletType:'MAIN', direction:'CREDIT', amount:'1', reason:'x' })).status, 403);
check('auditor CANNOT edit the plan',  (await call('PUT', '/admin/commission-rules', aud.accessToken, { kind:'DIRECT', level:1, percent:'9' })).status, 403);
check('auditor CANNOT manage roles',   (await call('GET', '/admin/roles', aud.accessToken)).status, 403);

console.log('\n=== grant a permission live, no re-login ===');
await call('PATCH', `/admin/roles/${newRoleId}`, su.accessToken, {
  permissionKeys: ['dashboard.view', 'users.view', 'withdrawals.view', 'audit.view', 'withdrawals.approve'],
});
await new Promise((r) => setTimeout(r, 300));
check('auditor now reaches approve (404 = past the gate)',
  (await call('POST', '/admin/withdrawals/nonexistent/approve', aud.accessToken)).status, 404);

console.log('\n=== seniority guard ===');
const ownerRole = roles.find((r: any) => r.isSystem);
check('cannot create a role above your own level',
  (await call('POST', '/admin/roles', aud.accessToken, { name: 'X', level: 1, permissionKeys: [] })).status, 403);
check('owner role is protected from deletion',
  (await call('DELETE', `/admin/roles/${ownerRole.id}`, su.accessToken)).status, 400);
