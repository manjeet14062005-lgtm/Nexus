const test = require('node:test');
const assert = require('node:assert/strict');
const { registrationEmailHandler } = require('./registrationEmail');
async function run(email, limited = false, fail = false) {
 const calls = [];
 const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
 const handler = registrationEmailHandler({ rateLimit: async () => limited, client: () => ({ rpc: async (...args) => { calls.push(args); return { data: true, error: fail }; } }) });
 await handler({ ip: '127.0.0.1', body: { email } }, res);
 return { res, calls };
}
test('normalizes email and exposes only registration boolean', async () => {
 const { res, calls } = await run(' Test@Example.com ');
 assert.deepEqual(res.body, { registered: true });
 assert.equal(calls[0][1].candidate_email, 'test@example.com');
});
test('invalid and rate-limited requests never query users', async () => {
 for (const [email, limited, status] of [['invalid', false, 400], ['test@example.com', true, 429]]) {
 const { res, calls } = await run(email, limited); assert.equal(res.statusCode, status); assert.equal(calls.length, 0);
 }
});
test('database failures return retryable error, not false availability', async () => {
 const { res } = await run('test@example.com', false, true); assert.equal(res.statusCode, 503); assert.equal(res.body.registered, undefined);
});
