const test = require('node:test'), assert = require('node:assert/strict');
const { parseHistory, safeRequest, readVerificationHistory, historyCsv } = require('./verificationHistory');
test('history rejects malformed ranges, filters, search syntax and unbounded pages', () => {
  for (const input of [{ page: -1 }, { page: 1.5 }, { limit: 5000 }, { status: 'broken' }, { sort: 'risk' }, { from: '2026-02-30' }, { from: '2026-09-02', to: '2026-09-01' }, { q: 'x),status.eq.verified' }]) assert.throws(() => parseHistory(input), error => error.status === 400);
});
test('history whitelists public fields and never returns phone or OTP secrets', () => {
  assert.deepEqual(safeRequest({ doc_id: 'request', data: { id: 'spoof', status: 'pending', codeHash: 'hash', codeSalt: 'salt', testCode: '123456', phone: '+123456789', phoneHash: 'hash', email: 'a@example.test' } }), { id: 'request', status: 'pending', email: 'a@example.test' });
});
test('database applies workspace scope, filters, stable order and page before returning records', async () => {
  const calls = []; const query = {};
  for (const method of ['select', 'eq', 'or', 'gte', 'lt', 'order']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  query.range = async (...args) => { calls.push(['range', ...args]); return { data: [{ doc_id: 'one', data: { status: 'verified', testCode: 'secret' } }], count: 60 }; };
  const result = await readVerificationHistory('team_one', { page: 2, limit: 25, from: '2026-10-01', to: '2026-10-02', status: 'verified', q: 'external_id', sort: 'oldest' }, { from: name => { assert.equal(name, 'nexus_documents'); return query; } });
  assert.ok(calls.some(call => call[0] === 'or' && call[1].includes('workspaces/team_one/verificationRequests')));
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'data->>status' && call[2] === 'verified'));
  assert.ok(calls.some(call => call[0] === 'lt' && call[2] === '2026-10-03T00:00:00.000Z'));
  assert.deepEqual(calls.at(-1), ['range', 25, 49]); assert.equal(result.total, 60); assert.equal(result.verificationRequests[0].testCode, undefined);
});
test('history propagates database errors rather than returning empty success', async () => {
  const query = {}; for (const method of ['select', 'eq', 'or', 'order']) query[method] = () => query;
  query.range = async () => ({ error: new Error('Unavailable') });
  await assert.rejects(() => readVerificationHistory('team', {}, { from: () => query }), /Unavailable/);
});
test('CSV excludes full destinations and escapes spreadsheet formula cells', () => {
  const csv = historyCsv([{ id: '=DANGEROUS()', phoneMasked: '+91••1234', email: 'private@example.test', phone: '+123456789', testCode: '123456' }]);
  assert.ok(csv.includes("'=DANGEROUS()")); assert.ok(!csv.includes('private@example.test')); assert.ok(!csv.includes('123456789')); assert.ok(!csv.includes('123456'));
});
test('a later page that becomes empty returns the remaining count instead of a 416 error', async () => {
  const query = {}; for (const method of ['select', 'eq', 'or', 'order']) query[method] = () => query;
  query.range = async (start) => start ? { error: { code: 'PGRST103' } } : { data: [], count: 0 };
  const result = await readVerificationHistory('team', { page: 3 }, { from: () => query });
  assert.equal(result.page, 3); assert.equal(result.total, 0); assert.deepEqual(result.verificationRequests, []);
});
