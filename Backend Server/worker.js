require('dotenv').config();

const { ensureSupabaseAdmin, adminDb } = require('./supabaseAdmin');
const { collectConfigStatus } = require('./readiness');
const { startWebhookWorker } = require('./webhooks');
const { startAutomationWorker } = require('./automation');
const { startReportScheduler } = require('./reportScheduler');
const { startRetentionWorker } = require('./retention');
const { bootstrapAdmins } = require('./auth');
const { startAccountDeletionWorker } = require('./accountLifecycle');

async function start() {
  const status = collectConfigStatus();
  if (!status.config.supabase) {
    console.error('❌ Worker requires Supabase configuration.');
    process.exitCode = 1;
    return;
  }

  const strict = String(process.env.NEXUS_STRICT_STARTUP || '').toLowerCase() === 'true';
  ensureSupabaseAdmin();

  const checks = [];
  if (!status.config.supabase) checks.push('Supabase credentials are not configured.');
  if (!status.config.resend) checks.push('Dedicated worker requires RESEND_API_KEY and RESEND_FROM_EMAIL for scheduled report delivery.');
  if (!String(process.env.WEBHOOK_ENCRYPTION_KEY || '').trim()) checks.push('Dedicated worker requires WEBHOOK_ENCRYPTION_KEY for webhook delivery.');
  try {
    await adminDb().collection('workspaces').limit(1).get();
  } catch (error) {
    checks.push(`Supabase connectivity failed: ${error.message}`);
  }
  if (checks.length && strict) {
    console.error('❌ Worker startup requirements failed:');
    for (const item of checks) console.error(`   - ${item}`);
    process.exit(1);
    return;
  }
  for (const item of checks) console.warn(`⚠️ Worker startup warning: ${item}`);

  ensureSupabaseAdmin();
  await bootstrapAdmins();

  // A dedicated worker process enables horizontal API scaling without running
  // Background jobs are stored in Supabase/Postgres. Deploy a dedicated worker
  // process for production; add a distributed queue when multiple workers are needed.
  process.env.WEBHOOK_WORKER_ENABLED = 'true';
  process.env.AUTOMATION_WORKER_ENABLED = 'true';
  process.env.REPORT_SCHEDULER_ENABLED = 'true';

  const timers = [
    startWebhookWorker(),
    startAutomationWorker(),
    startReportScheduler(),
    startRetentionWorker(),
    startAccountDeletionWorker(),
  ].filter(Boolean);

  console.log(`🧰 Nexus worker started with ${timers.length} worker(s).`);

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`🛑 ${signal} received; stopping worker.`);
    for (const timer of timers) clearInterval(timer);
    setTimeout(() => process.exit(0), 100).unref?.();
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error) => {
  console.error(`❌ Worker failed to start: ${error.message}`);
  process.exit(1);
});
