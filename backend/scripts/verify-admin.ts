import 'dotenv/config';

const API = 'http://localhost:4000/api/v1';
let token = '';

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, json };
}

const pad = (s: string, n: number) => s.padEnd(n);
const results: [string, string, number, string][] = [];
async function probe(label: string, method: string, path: string, body?: unknown, expect = 200) {
  const r = await call(method, path, body);
  const ok = r.status === expect ? 'PASS' : 'FAIL';
  results.push([ok, `${method} ${path}`, r.status, label]);
  return r;
}

console.log('=== admin login ===');
const login = await call('POST', '/admin/login', { email: 'contactsanket1@gmail.com', password: 'Sanket@3030' });
token = login.json?.data?.accessToken ?? '';
console.log(`  ${login.status} — ${login.json?.data?.admin?.name} (${login.json?.data?.admin?.role})`);

console.log('\n=== exercising every admin endpoint ===');
await probe('identity', 'GET', '/admin/me');
await probe('dashboard overview', 'GET', '/admin/reports/overview');
await probe('top earners', 'GET', '/admin/reports/top-earners?take=5');
await probe('income series', 'GET', '/admin/reports/income-series?days=30');
await probe('cap utilisation', 'GET', '/admin/reports/cap-utilisation');
await probe('queue health', 'GET', '/admin/queues');

const users = await probe('user list', 'GET', '/admin/users?take=5');
const uid = users.json?.data?.rows?.[0]?.id;
await probe('user search', 'GET', '/admin/users?q=fx');
if (uid) {
  await probe('user detail', 'GET', `/admin/users/${uid}`);
  await probe('recalculate team', 'POST', `/admin/users/${uid}/recalculate-team`);
  await probe('manual credit', 'POST', `/admin/users/${uid}/adjust`,
    { walletType: 'MAIN', direction: 'CREDIT', amount: '12.50', reason: 'Goodwill credit — verification run' });
  await probe('adjust rejects missing reason', 'POST', `/admin/users/${uid}/adjust`,
    { walletType: 'MAIN', direction: 'CREDIT', amount: '5' }, 422);
  await probe('set affiliate mode', 'PATCH', `/admin/users/${uid}/affiliate-mode`, { affiliateMode: 'ACTIVE' });
  await probe('set status', 'PATCH', `/admin/users/${uid}/status`, { status: 'ACTIVE' });
}

await probe('deposits', 'GET', '/admin/deposits?take=5');
await probe('withdrawals', 'GET', '/admin/withdrawals?take=5');
await probe('overdue withdrawals', 'GET', '/admin/withdrawals?overdue=true');

await probe('packages', 'GET', '/admin/packages');
await probe('commission rules', 'GET', '/admin/commission-rules');
await probe('ranks', 'GET', '/admin/ranks');
await probe('rank achievements', 'GET', '/admin/rank-achievements');
await probe('roaming tiers', 'GET', '/admin/roaming-tiers');
await probe('roaming awards', 'GET', '/admin/roaming-awards');
await probe('settings', 'GET', '/admin/settings');
await probe('audit log', 'GET', '/admin/audit?take=10');

console.log('');
for (const [ok, ep, status, label] of results) {
  console.log(`  ${ok}  ${pad(ep, 46)} ${status}  ${label}`);
}
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n  ${results.length - failed}/${results.length} passed`);
