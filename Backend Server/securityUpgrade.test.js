const test = require('node:test'), assert = require('node:assert/strict');
const { cleanDomains, updateSecurityPolicy } = require('./securityPolicies');
const { runRetentionSweep, visitCollectionPages } = require('./retention');

test('invalid domains never silently remove restrictions', () => {
  for (const domains of [['invalid'], ['valid.test', 'invalid'], [''], null, [7]]) assert.throws(() => cleanDomains(domains), error => error.status === 400);
  assert.deepEqual(cleanDomains([]), []);
  assert.deepEqual(cleanDomains([' @Example.COM ', 'example.com']), ['example.com']);
});
function database(fail = false) {
  const writes = [], existing = { allowedInviteDomains: ['company.test'], auditLogRetentionDays: 180, apiLogRetentionDays: 90, webhookDeliveryRetentionDays: 30 };
  const ref = path => ({ path, collection: name => ({ doc: id => ref(`${path}/${name}/${id || 'event'}`) }) });
  const store = { collection: name => ({ doc: id => ref(`${name}/${id}`) }), runTransaction: async fn => {
    const pending = [];
    const result = await fn({ get: async () => ({ exists: true, data: () => existing }), set: (reference, data) => pending.push({ path: reference.path, data }) });
    if (fail) throw new Error('Atomic commit failed');
    writes.push(...pending); return result;
  } };
  return { db: () => store, writes };
}
test('policy and its audit event commit together with the authenticated actor', async () => {
  const { db, writes } = database();
  const result = await updateSecurityPolicy({ workspaceId: 'team', uid: 'owner', input: { apiLogRetentionDays: 60 }, db });
  assert.equal(result.apiLogRetentionDays, 60); assert.deepEqual(result.allowedInviteDomains, ['company.test']);
  assert.equal(writes.length, 2); assert.equal(writes[1].data.actorUid, 'owner'); assert.equal(writes[1].data.type, 'security_policy.updated');
});
test('failed atomic commit persists neither policy nor audit event', async () => {
  const { db, writes } = database(true);
  await assert.rejects(() => updateSecurityPolicy({ workspaceId: 'team', uid: 'owner', input: { allowedInviteDomains: [] }, db }));
  assert.equal(writes.length, 0);
});
test('invalid policy input queues no changes', async () => {
  const { db, writes } = database();
  for (const input of [{ allowedInviteDomains: ['invalid'] }, { apiLogRetentionDays: 7 }]) await assert.rejects(() => updateSecurityPolicy({ workspaceId: 'team', uid: 'owner', input, db }));
  assert.equal(writes.length, 0);
});
test('retention visits workspaces beyond the first page and deduplicates legacy paths', async () => {
  const visited = [];
  const result = await runRetentionSweep({ maxWorkspaces: 2, pages: async (name, path, size, visit) => {
    assert.equal(size, 2); await visit(['one', 'two']); await visit(['two', 'three']); await visit(['four']);
  }, purge: async id => { visited.push(id); return 2; }, legacy: async () => 1 });
  assert.deepEqual(visited, ['one', 'two', 'three', 'four']); assert.deepEqual(result, { workspaces: 4, removed: 9 });
});
test('retention pages use deterministic ordering and inclusive ranges', async () => {
  const ranges = [], orders = [], visited = [];
  const query = { select() { return this; }, eq() { return this; }, or() { return this; }, order(field) { orders.push(field); return this; }, async range(from, to) { ranges.push([from, to]); return { data: from === 0 ? [{ doc_id: 'a' }, { doc_id: 'b' }] : [{ doc_id: 'c' }] }; } };
  await visitCollectionPages('workspaces', 'workspaces', 2, async ids => visited.push(...ids), { from: () => query });
  assert.deepEqual(ranges, [[0, 1], [2, 3]]); assert.deepEqual(visited, ['a', 'b', 'c']); assert.ok(orders.includes('doc_id')); assert.ok(orders.includes('collection_path'));
});
test('retention read failures propagate instead of reporting successful cleanup', async () => {
  const query = { select() { return this; }, eq() { return this; }, or() { return this; }, order() { return this; }, async range() { return { error: new Error('Database unavailable') }; } };
  await assert.rejects(() => visitCollectionPages('workspaces', 'workspaces', 25, async () => {}, { from: () => query }), /Database unavailable/);
});
