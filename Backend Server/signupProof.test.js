const test = require('node:test');
const assert = require('node:assert/strict');
const { issuePhoneProof, verifyPhoneProof } = require('./signupProof');
const { beforeUserCreated } = require('./signupHook');
const { Webhook } = require('standardwebhooks');
process.env.SIGNUP_PROOF_SECRET = 'test-only-proof-secret-not-for-deployment-123456';
const phone = '+442079460018', email = 'test@example.com';
test('phone proof is bound to phone and email and expires', () => {
 const proof = issuePhoneProof(phone, email, 1000000);
 assert.ok(verifyPhoneProof(proof.token, phone, email, 1000001));
 assert.equal(verifyPhoneProof(proof.token, '+12025550123', email, 1000001), false);
 assert.equal(verifyPhoneProof(proof.token, phone, 'other@example.com', 1000001), false);
 assert.equal(verifyPhoneProof(proof.token, phone, email, proof.expiresAt), false);
 assert.equal(verifyPhoneProof(proof.token + 'tampered', phone, email, 1000001), false);
});
test('signed signup hook accepts proof and rejects forged or missing proof', () => {
 const secret = Buffer.alloc(32, 7).toString('base64');
 process.env.SUPABASE_BEFORE_USER_CREATED_SECRET = `v1,whsec_${secret}`;
 const proof = issuePhoneProof(phone, email);
 const invoke = (metadata, tamper = false, app_metadata = {}) => {
  const body = JSON.stringify({ user: { email, user_metadata: metadata, app_metadata } });
  const timestamp = new Date();
  const headers = { 'webhook-id': 'test-id', 'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000)), 'webhook-signature': new Webhook(secret).sign('test-id', timestamp, body) };
  let status, payload;
  beforeUserCreated({ body: Buffer.from(tamper ? body + ' ' : body), headers }, { status(value) { status = value; return this; }, json(value) { payload = value; } });
  return { status, payload };
 };
 assert.equal(invoke({ phone, signupPhoneProof: proof.token }).status, 200);
 assert.equal(invoke({ phone, phoneVerified: true }).status, 400);
 assert.equal(invoke({}, false, { provider: 'google' }).status, 200);
 assert.equal(invoke({ provider: 'google' }).status, 400);
 assert.equal(invoke({}, true, { provider: 'google' }).status, 401);
 assert.equal(invoke({ phone, signupPhoneProof: proof.token }, true).status, 401);
});
