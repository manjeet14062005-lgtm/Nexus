const test = require('node:test');
const assert = require('node:assert/strict');
const { accountPhoneHandlers } = require('./accountPhone');
function setup({ locked = false, approved = true, limited = false, saveError = null } = {}) {
 const calls = [];
 const db = { from: () => db, select: () => db, eq: () => db,
  limit: async () => ({ data: [{ data: { phone: locked ? '+442079460018' : '', phoneVerified: locked } }] }),
  rpc: async (name, args) => { calls.push({ name, args }); return { error: saveError }; } };
 const provider = { verifications: { create: async args => calls.push({ send: args }) }, verificationChecks: { create: async () => ({ status: approved ? 'approved' : 'pending' }) } };
 const handlers = accountPhoneHandlers({ client: () => db, rateLimit: async () => limited, service: () => provider });
 const invoke = async (action, body = { phone: '+442079460018', code: '123456', userId: 'attacker' }) => {
  const res = { statusCode: 200, status(v) { this.statusCode = v; return this; }, json(v) { this.body = v; return this; } };
  await handlers[action]({ auth: { uid: 'signed-in-user' }, body }, res); return res;
 };
 return { calls, invoke };
}
test('approved OTP persists against authenticated identity only', async () => {
 const { calls, invoke } = setup(); assert.equal((await invoke('verify')).statusCode, 200);
 assert.deepEqual(calls[0], { name: 'nexus_lock_verified_phone', args: { target_user: 'signed-in-user', verified_phone: '+442079460018' } });
});
test('verified numbers reject both sending and saving', async () => {
 const { calls, invoke } = setup({ locked: true });
 assert.equal((await invoke('send')).statusCode, 409); assert.equal((await invoke('verify')).statusCode, 409); assert.equal(calls.length, 0);
});
test('incorrect OTP does not save a phone', async () => {
 const { calls, invoke } = setup({ approved: false });
 assert.equal((await invoke('verify')).statusCode, 400); assert.equal(calls.length, 0);
});
test('send requests do not mark phones verified', async () => {
 const { calls, invoke } = setup(); assert.equal((await invoke('send')).statusCode, 200);
 assert.deepEqual(calls, [{ send: { to: '+442079460018', channel: 'sms' } }]);
});
test('rate limit and invalid inputs stop provider calls', async () => {
 const { calls, invoke } = setup({ limited: true });
 assert.equal((await invoke('send')).statusCode, 429);
 assert.equal((await invoke('verify', { phone: '123', code: 'abc' })).statusCode, 400); assert.equal(calls.length, 0);
});
test('concurrent number lock is reported without false success', async () => {
 const { invoke } = setup({ saveError: { code: '23505' } });
 const result = await invoke('verify'); assert.equal(result.statusCode, 409); assert.equal(result.body.success, undefined);
});
