const test = require('node:test');
const assert = require('node:assert/strict');
const { collectConfigStatus } = require('./readiness');

test('readiness follows the selected Gemini provider instead of a stale Anthropic key',()=>{
 const previous={...process.env};
 try {
  process.env.NEXUS_AI_PROVIDER='gemini';process.env.GEMINI_API_KEY='test-google-key';delete process.env.ANTHROPIC_API_KEY;
  const status=collectConfigStatus();assert.equal(status.config.intelligence,true);assert.equal(status.config.aiProvider,'gemini');assert.ok(!status.warnings.some(text=>text.includes('Nexus Intelligence is unavailable')));
  delete process.env.GEMINI_API_KEY;process.env.ANTHROPIC_API_KEY='stale-key';assert.equal(collectConfigStatus().config.intelligence,false);
 } finally {process.env=previous;}
});
test('production readiness reports invalid origins instead of crashing', () => {
 const previous = { ...process.env };
 try {
  process.env.NODE_ENV = 'production'; process.env.FRONTEND_URL = 'http://localhost:3000';
  assert.ok(collectConfigStatus().blocking.some(x => x.includes('HTTPS')));
  process.env.FRONTEND_URL = 'https://nexus.example.com';
  assert.equal(collectConfigStatus().blocking.some(x => x.includes('HTTPS')), false);
  delete process.env.SUPABASE_BEFORE_USER_CREATED_SECRET;
  assert.ok(collectConfigStatus().blocking.some(x => x.includes('Before User Created')));
 } finally { process.env = previous; }
});
