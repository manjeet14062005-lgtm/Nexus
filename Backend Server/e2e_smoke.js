/*
 * Remote smoke test for an already deployed Nexus API.
 * No project dependencies are required; Node 18+ provides fetch().
 *
 * Required:
 *   NEXUS_E2E_BASE_URL=https://api.example.com
 * Optional but strongly recommended:
 *   NEXUS_E2E_SUPABASE_ACCESS_TOKEN=<short-lived Supabase access token>
 *   NEXUS_E2E_WORKSPACE_ID=<workspace id>
 *   NEXUS_E2E_API_KEY=nx_test_...
 *   NEXUS_E2E_RUN_VERIFICATION=true
 *   NEXUS_E2E_EMAIL=smoke@example.com
 */

const BASE_URL = String(process.env.NEXUS_E2E_BASE_URL || '').replace(/\/$/, '');
const TOKEN = String(process.env.NEXUS_E2E_SUPABASE_ACCESS_TOKEN || '');
const WORKSPACE_ID = String(process.env.NEXUS_E2E_WORKSPACE_ID || '');
const API_KEY = String(process.env.NEXUS_E2E_API_KEY || '');
const RUN_VERIFICATION = String(process.env.NEXUS_E2E_RUN_VERIFICATION || '').toLowerCase() === 'true';
const EMAIL = String(process.env.NEXUS_E2E_EMAIL || `nexus-smoke-${Date.now()}@example.com`).slice(0, 200);

if (!BASE_URL) {
  console.error('FAIL: NEXUS_E2E_BASE_URL is required.');
  process.exit(1);
}
if (!/^https?:\/\//i.test(BASE_URL)) {
  console.error('FAIL: NEXUS_E2E_BASE_URL must be an http(s) URL.');
  process.exit(1);
}
if (RUN_VERIFICATION && (!API_KEY || !API_KEY.startsWith('nx_test_'))) {
  console.error('FAIL: NEXUS_E2E_RUN_VERIFICATION=true requires an nx_test_ API key.');
  process.exit(1);
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
  return { response, data };
}

function expect(name, condition, detail = '') {
  if (!condition) throw new Error(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`PASS: ${name}`);
}

(async () => {
  try {
    const health = await request('/health');
    expect('health endpoint', health.response.status === 200 && health.data?.status === 'ok');

    const ready = await request('/readyz');
    expect('readiness endpoint responds', [200, 503].includes(ready.response.status));
    if (ready.response.status !== 200) {
      console.warn(`WARN: /readyz returned ${ready.response.status}; deployment is not fully ready.`);
    } else {
      expect('readiness reports ready', ready.data?.status === 'ready' || ready.data?.ready === true);
    }

    const unauth = await request('/auth/context');
    expect('protected auth route rejects anonymous request', unauth.response.status === 401);

    if (TOKEN) {
      const auth = await request('/auth/context', {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      expect('Supabase-authenticated context works', auth.response.status === 200 && Boolean(auth.data?.user?.uid));

      if (WORKSPACE_ID) {
        const access = await request(`/workspaces/${encodeURIComponent(WORKSPACE_ID)}/access`, {
          headers: { Authorization: `Bearer ${TOKEN}` },
        });
        expect('authenticated workspace authorization works', access.response.status === 200 && access.data?.workspace?.id === WORKSPACE_ID);
      }
    }

    if (API_KEY) {
      expect('API key has expected test/live prefix', /^(nx_test_|nx_live_)/.test(API_KEY));
      const usage = await request('/v1/usage', {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      expect('API-key usage endpoint responds', [200, 401, 403, 404].includes(usage.response.status));
      if (usage.response.status !== 200) {
        console.warn(`WARN: API-key usage check returned ${usage.response.status}.`);
      }

      if (RUN_VERIFICATION) {
        const created = await request('/v1/verifications', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            'X-Request-ID': `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          },
          body: JSON.stringify({ method: 'email', email: EMAIL, external_user_id: `smoke-${Date.now()}` }),
        });
        expect('test verification can be created', created.response.status === 201, created.data?.message || 'unexpected response');
        const id = created.data?.verification?.id;
        expect('verification response contains an id', Boolean(id));

        const fetched = await request(`/v1/verifications/${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        });
        expect('created verification can be fetched', fetched.response.status === 200 && fetched.data?.verification?.id === id);

        const completed = await request(`/v1/verifications/${encodeURIComponent(id)}/verify`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code: '123456' }),
        });
        expect('test verification can be completed', completed.response.status === 200 && completed.data?.verification?.status === 'verified', completed.data?.message || 'unexpected response');
      }
    }

    console.log('nexus_e2e_smoke: PASS');
  } catch (error) {
    console.error(`nexus_e2e_smoke: FAIL — ${error.message}`);
    process.exit(1);
  }
})();
