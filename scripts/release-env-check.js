// Run only for a hosted release; local production builds remain available.
require('dotenv').config({ path: '.env.production' });
if (process.env.NEXUS_RELEASE_BUILD !== 'true') process.exit(0);
const errors = [];
for (const key of ['REACT_APP_OTP_SERVER_URL', 'REACT_APP_SUPABASE_URL', 'REACT_APP_SUPABASE_EMAIL_REDIRECT_URL', 'REACT_APP_SUPABASE_OAUTH_REDIRECT_URL']) {
 try {
  const url = new URL(process.env[key]);
  if (url.protocol !== 'https:' || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url.hostname) || url.username || url.password) throw new Error();
 } catch { errors.push(`${key} must be a public HTTPS URL.`); }
}
if (!process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY && !process.env.REACT_APP_SUPABASE_ANON_KEY) errors.push('A Supabase public key is required.');
for (const key of Object.keys(process.env)) {
 if (key.startsWith('REACT_APP_') && /(SECRET|SERVICE_ROLE|PRIVATE|AUTH_TOKEN)/.test(key) && process.env[key]) errors.push(`${key} must never be exposed in the browser bundle.`);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('Frontend release environment passed.');
