const { ensureSupabaseAdmin, adminDb } = require('./supabaseAdmin');
const {providerConfig}=require('./geminiProvider');

function envPresent(...names) {
  return names.every((name) => Boolean(String(process.env[name] || '').trim()));
}

function collectConfigStatus() {
  const supabase = envPresent('SUPABASE_URL', 'SUPABASE_SECRET_KEY') || envPresent('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');
  const frontendOrigins = String(process.env.FRONTEND_URL || '').trim();
  const frontendUrl = Boolean(frontendOrigins);
  const razorpay = envPresent('RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET');
  const twilio = envPresent('TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_SERVICE_SID');
  const resend = envPresent('RESEND_API_KEY', 'RESEND_FROM_EMAIL');
  const anthropic = Boolean(String(process.env.ANTHROPIC_API_KEY || '').trim());
  const gemini = envPresent('GEMINI_API_KEY');
  let intelligence=false,aiProvider='invalid';
  try { const ai=providerConfig(); aiProvider=ai.provider; intelligence=Boolean(String(ai.apiKey||'').trim()); } catch { /* Report invalid selection without credentials. */ }
  const production = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  const webhookWorker = String(process.env.WEBHOOK_WORKER_ENABLED || '').toLowerCase() === 'true';
  const reportScheduler = String(process.env.REPORT_SCHEDULER_ENABLED || '').toLowerCase() === 'true';
  const requireBilling = String(process.env.NEXUS_REQUIRE_BILLING || '').toLowerCase() === 'true';
  const requireWebhooks = String(process.env.NEXUS_REQUIRE_WEBHOOKS || '').toLowerCase() === 'true';
  const allowHttpWebhooks = String(process.env.WEBHOOK_ALLOW_HTTP || '').toLowerCase() === 'true';
  const distributedRateLimiting = Boolean(
    String(process.env.UPSTASH_REDIS_REST_URL || '').trim() &&
    String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim()
  );
  const requireDistributedRateLimiting = String(process.env.NEXUS_REQUIRE_DISTRIBUTED_RATE_LIMITING || '').toLowerCase() === 'true';
  const horizontalScaling = String(process.env.NEXUS_HORIZONTAL_SCALING || '').toLowerCase() === 'true';
  const processRole = String(process.env.NEXUS_PROCESS_ROLE || (production ? 'api' : 'all')).toLowerCase();

  const blocking = [];
  const warnings = [];
  if (!supabase) blocking.push('Supabase service-role credentials are not configured.');
  if (!frontendUrl) blocking.push('FRONTEND_URL is not configured.');
  if (production && frontendUrl && !frontendOrigins.split(',').map((v) => v.trim()).filter(Boolean).every((v) => v.startsWith('https://'))) {
    blocking.push('Production FRONTEND_URL must contain only HTTPS origins.');
  }
  if (requireBilling && !razorpay) blocking.push('NEXUS_REQUIRE_BILLING is enabled but Razorpay production configuration is incomplete.');
  else if (!razorpay) warnings.push('Razorpay production configuration is incomplete; paid subscriptions will not work.');
  if (production && !twilio) blocking.push("Twilio is required for mandatory signup phone verification.");
  if (production && !process.env.SUPABASE_BEFORE_USER_CREATED_SECRET) blocking.push("Configure the signed Supabase Before User Created hook for mandatory phone verification.");
  if (production && process.env.NEXUS_SIGNUP_HOOK_ENABLED !== "true") blocking.push("Confirm the Before User Created hook is enabled in Supabase, then set NEXUS_SIGNUP_HOOK_ENABLED=true.");
  if (!twilio) warnings.push('Twilio production configuration is incomplete; phone verification is unavailable.');
  if (!resend) warnings.push('Transactional email configuration is incomplete; live email verification and scheduled report email delivery are unavailable.');
  if (reportScheduler && !resend) blocking.push('REPORT_SCHEDULER_ENABLED is true but transactional email configuration is incomplete.');
  if ((webhookWorker || requireWebhooks) && !String(process.env.WEBHOOK_ENCRYPTION_KEY || '').trim()) blocking.push('Webhook capability is enabled/required but WEBHOOK_ENCRYPTION_KEY is not configured.');
  if (production && allowHttpWebhooks) blocking.push('WEBHOOK_ALLOW_HTTP must be false in production.');
  if (!distributedRateLimiting) {
    if (requireDistributedRateLimiting) blocking.push('Distributed rate limiting is required but UPSTASH_REDIS_REST_URL/TOKEN are not configured.');
    else warnings.push('Rate limiting is using the in-memory fallback; configure Upstash Redis before horizontal API scaling.');
  }
  if (horizontalScaling && !distributedRateLimiting) warnings.push('NEXUS_HORIZONTAL_SCALING is enabled without distributed rate limiting.');
  if (processRole === 'api' && (webhookWorker || reportScheduler || String(process.env.AUTOMATION_WORKER_ENABLED || '').toLowerCase() === 'true')) {
    warnings.push('API process role does not run background workers; deploy worker.js separately.');
  }
  if (!['api', 'all'].includes(processRole)) warnings.push(`NEXUS_PROCESS_ROLE=${processRole} is not used by server.js; use api or all.`);
  if (!intelligence) warnings.push('The selected AI provider configuration is missing or invalid; Nexus Intelligence is unavailable.');

  return {
    config: { supabase, frontendUrl, razorpay, twilio, resend, anthropic, gemini, intelligence, aiProvider, production, webhookWorker, reportScheduler, requireBilling, requireWebhooks, allowHttpWebhooks, distributedRateLimiting, requireDistributedRateLimiting, horizontalScaling, processRole },
    blocking,
    warnings,
  };
}

async function checkReadiness() {
  const configStatus = collectConfigStatus();
  if (configStatus.blocking.length) {
    return { ready: false, ...configStatus, database: false };
  }

  let database = false;
  try {
    ensureSupabaseAdmin();
    await adminDb().collection('workspaces').limit(1).get();
    database = true;
  } catch (error) {
    return {
      ready: false,
      ...configStatus,
      database: false,
      blocking: [...configStatus.blocking, `Supabase database readiness check failed: ${error.message}`],
    };
  }

  return { ready: true, ...configStatus, database: true };
}

module.exports = { collectConfigStatus, checkReadiness };
