const { createClient } = require('@supabase/supabase-js');

let client = null;

function getUrl() { return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL; }
function getSecretKey() { return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY; }

function ensureSupabaseAdmin() {
  if (client) return client;
  const url = getUrl();
  const key = getSecretKey();
  if (!url || !key) throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).');
  client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  return client;
}

const supabaseAdmin = new Proxy({}, { get(_target, prop) { const value = ensureSupabaseAdmin()[prop]; return typeof value === 'function' ? value.bind(ensureSupabaseAdmin()) : value; } });

function decodeJwtPayload(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return {};
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch { return {}; }
}

// In-process token verification cache — keyed by SHA-256(accessToken), TTL 30 s.
// Reduces Supabase Auth API calls under concurrent load without stale-token risk.
const _tokenCache = new Map();

function adminAuth() {
  const sb = ensureSupabaseAdmin();
  return {
    async verifyIdToken(accessToken) {
      // Cache verified tokens for 30 s to avoid a Supabase Auth API call on
      // every single authenticated request under load.
      const cacheKey = require('crypto').createHash('sha256').update(accessToken).digest('hex');
      const now = Date.now();
      const cached = _tokenCache.get(cacheKey);
      if (cached && cached.expiresAt > now) return cached.result;
      _tokenCache.delete(cacheKey);

      const { data, error } = await sb.auth.getUser(accessToken);
      if (error || !data?.user) throw error || new Error('Invalid Supabase access token.');
      const claims = decodeJwtPayload(accessToken);
      if (!claims.exp || Number(claims.exp) * 1000 <= now) throw new Error('Expired Supabase access token.');
      const result = {
        ...claims,
        uid: data.user.id,
        email: data.user.email || null,
        email_verified: Boolean(data.user.email_confirmed_at),
        auth_time: Number(claims.auth_time || (Array.isArray(claims.amr) ? Math.max(0, ...claims.amr.map((item) => Number(item.timestamp) || 0)) : 0)),
        role: data.user.app_metadata?.role || null,
        admin: data.user.app_metadata?.admin === true,
      };

      // Store with 30 s TTL; cap cache size to avoid unbounded memory growth
      if (_tokenCache.size > 10000) _tokenCache.clear();
      _tokenCache.set(cacheKey, { result, expiresAt: Math.min(now + 30_000, Number(claims.exp) * 1000) });
      return result;
    },
    async getUser(uid) {
      const { data, error } = await sb.auth.admin.getUserById(uid);
      if (error) throw error;
      return data.user;
    },
    async setCustomUserClaims(uid, claims) {
      const user = await this.getUser(uid);
      const appMetadata = { ...(user.app_metadata || {}), ...claims };
      const { data, error } = await sb.auth.admin.updateUserById(uid, { app_metadata: appMetadata });
      if (error) throw error;
      return data.user;
    },
    async revokeRefreshTokens(accessToken) {
      // Supabase Admin signOut requires an access JWT, not a user ID.
      const { error } = await sb.auth.admin.signOut(accessToken, 'global');
      if (error) throw error;
      _tokenCache.clear();
    },
    async deleteUser(uid) {
      const { data, error } = await sb.auth.admin.deleteUser(uid, false);
      if (error) throw error;
      return data;
    },
  };
}

module.exports = { ensureSupabaseAdmin, supabaseAdmin, adminAuth, decodeJwtPayload };
Object.defineProperty(module.exports, 'adminDb', { enumerable: true, get: () => require('./supabaseDocumentStore').adminDb });
