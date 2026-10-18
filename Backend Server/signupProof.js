const crypto = require('node:crypto');
function signingKey() {
  const secret = process.env.SIGNUP_PROOF_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.length < 32) throw new Error('Signup verification signing secret is not configured.');
  return crypto.createHmac('sha256', secret).update('nexus:signup-phone-proof:v1').digest();
}
function issuePhoneProof(phone, email, now = Date.now()) {
  if (!/^\+[1-9]\d{6,14}$/.test(phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) throw new Error('A valid phone and registration email are required.');
  const expiresAt = now + 15 * 60 * 1000;
  const body = Buffer.from(JSON.stringify({ phone, email: email.trim().toLowerCase(), expiresAt })).toString('base64url');
  const signature = crypto.createHmac('sha256', signingKey()).update(body).digest('base64url');
  return { token: `${body}.${signature}`, expiresAt };
}
function verifyPhoneProof(token, phone, email, now = Date.now()) {
  try {
    if (typeof token !== 'string' || token.length > 2048) return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const expected = crypto.createHmac('sha256', signingKey()).update(parts[0]).digest();
    const signature = Buffer.from(parts[1], 'base64url');
    if (signature.length !== expected.length || !crypto.timingSafeEqual(signature, expected)) return false;
    const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    return data.phone === phone && data.email === String(email || '').trim().toLowerCase() && data.expiresAt > now && data.expiresAt <= now + 15 * 60 * 1000;
  } catch { return false; }
}
module.exports = { issuePhoneProof, verifyPhoneProof };
