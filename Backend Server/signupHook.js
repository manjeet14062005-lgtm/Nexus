const { Webhook } = require('standardwebhooks');
const { verifyPhoneProof } = require('./signupProof');
function beforeUserCreated(req, res) {
  const secret = process.env.SUPABASE_BEFORE_USER_CREATED_SECRET;
  if (!secret) return res.status(503).json({ error: { http_code: 503, message: 'Registration verification is unavailable.' } });
  let event;
  try {
    event = new Webhook(secret.replace(/^v1,whsec_/, '')).verify(req.body.toString('utf8'), req.headers);
  } catch { return res.status(401).json({ error: { http_code: 401, message: 'Invalid hook signature.' } }); }
  const user = event.user || {};
  // Provider information is supplied by Auth, never by editable user metadata.
  const appMetadata = user.app_metadata || user.raw_app_meta_data || {};
  if (appMetadata.provider === 'google') return res.status(200).json({});
  const metadata = user.user_metadata || user.raw_user_meta_data || {};
  if (!verifyPhoneProof(metadata.signupPhoneProof, metadata.phone, user.email)) {
    return res.status(400).json({ error: { http_code: 400, message: 'Verify your phone on the Nexus registration page before creating an account.' } });
  }
  return res.status(200).json({});
}
module.exports = { beforeUserCreated };
