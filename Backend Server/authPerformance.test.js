const test = require('node:test');
const assert = require('node:assert/strict');
const admin = { supabaseAdmin: {} };
require.cache[require.resolve('./supabaseAdmin')] = { id: require.resolve('./supabaseAdmin'), filename: require.resolve('./supabaseAdmin'), loaded: true, exports: admin };
let results, calls, document;
admin.adminAuth = () => ({ verifyIdToken: async () => ({ uid: 'test-user', email: 'test@example.test' }) });
admin.supabaseAdmin.from = table => {
  const query = { select: () => query, eq: () => query, maybeSingle: () => {
    calls.push(table); return typeof results[table] === 'function' ? results[table]() : Promise.resolve(results[table]);
  } }; return query;
};
admin.adminDb = () => ({ collection: () => ({ doc: () => ({ get: () => { calls.push('document'); return Promise.resolve(document); } }) }) });
const { authenticate, getWorkspaceMembership } = require('./auth');
function reset() { calls = []; results = {}; document = { exists: false }; }
function response() { return { status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } }; }
test('account controls and role reads start together, with fresh checks for every request', async () => {
  reset(); let release;
  results.nexus_account_controls = () => new Promise(resolve => { release = resolve; });
  results.nexus_user_roles = { data: { role: 'moderator' } };
  const req = { headers: { authorization: 'Bearer test' } }; let next = 0;
  const pending = authenticate(req, response(), () => next++);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['nexus_account_controls', 'nexus_user_roles']);
  release({ data: { status: 'active' } }); await pending;
  assert.equal(next, 1); assert.equal(req.auth.globalRole, 'moderator');
  results.nexus_account_controls = { data: { status: 'suspended' } };
  const res = response(); await authenticate(req, res, () => next++);
  assert.equal(res.code, 403); assert.equal(next, 1);
});
test('failed account checks cannot be bypassed by a successful role read', async () => {
  reset(); results.nexus_account_controls = { error: { code: 'NETWORK_ERROR' } };
  results.nexus_user_roles = { data: { role: 'admin' } };
  const res = response(); await authenticate({ headers: { authorization: 'Bearer test' } }, res, () => assert.fail('must not authorize'));
  assert.equal(res.code, 503);
});
test('parallel membership reads retain normalized authority over legacy data', async () => {
  reset(); results.nexus_workspaces = { data: { id: 'team', owner_id: 'other' } };
  results.nexus_workspace_members = { data: { role: 'viewer' } };
  document = { exists: true, data: () => ({ name: 'Team', ownerUid: 'test-user' }) };
  const membership = await getWorkspaceMembership('test-user', 'team');
  assert.deepEqual(calls, ['nexus_workspaces', 'document', 'nexus_workspace_members']);
  assert.equal(membership.role, 'viewer'); assert.equal(membership.owner, false);
  results.nexus_workspace_members = { data: null };
  assert.equal(await getWorkspaceMembership('test-user', 'team'), null);
});
test('a membership read failure fails closed', async () => {
  reset(); results.nexus_workspaces = { data: { id: 'team', owner_id: 'test-user' } };
  results.nexus_workspace_members = { error: new Error('database unavailable') };
  await assert.rejects(getWorkspaceMembership('test-user', 'team'), /database unavailable/);
});
