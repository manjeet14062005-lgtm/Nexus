const { adminDb, ensureSupabaseAdmin } = require('./supabaseAdmin');
const { getSecurityPolicy, retentionCutoffIso } = require('./securityPolicies');

async function deleteOldDocs(ref, cutoffIso, limit = 300) {
  const snapshot = await ref.where('createdAt', '<', cutoffIso).limit(limit).get();
  if (snapshot.empty) return 0;
  const batch = adminDb().batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return snapshot.size;
}

async function purgeWorkspaceRetention(workspaceId) {
  const policy = await getSecurityPolicy(workspaceId);
  const workspaceRef = adminDb().collection('workspaces').doc(workspaceId);
  let removed = 0;

  removed += await deleteOldDocs(workspaceRef.collection('securityEvents'), retentionCutoffIso(policy.auditLogRetentionDays));
  removed += await deleteOldDocs(workspaceRef.collection('apiLogs'), retentionCutoffIso(policy.apiLogRetentionDays));
  removed += await deleteOldDocs(workspaceRef.collection('webhookEvents'), retentionCutoffIso(policy.webhookDeliveryRetentionDays));
  removed += await deleteOldDocs(workspaceRef.collection('reportRuns'), retentionCutoffIso(policy.auditLogRetentionDays));
  removed += await deleteOldDocs(workspaceRef.collection('automationJobs'), retentionCutoffIso(policy.auditLogRetentionDays));

  await visitCollectionPages('webhooks', `${workspaceRef.path}/webhooks`, 100, async ids => {
    for (const id of ids) removed += await deleteOldDocs(workspaceRef.collection('webhooks').doc(id).collection('deliveries'), retentionCutoffIso(policy.webhookDeliveryRetentionDays));
  });
  return removed;
}

async function purgeLegacyWorkspaceActivity(maxAgeDays = 365) {
  return deleteOldDocs(adminDb().collection('workspaceActivity'), retentionCutoffIso(maxAgeDays));
}

async function visitCollectionPages(collection, path, pageSize, visit, client = ensureSupabaseAdmin()) {
  for (let offset = 0; ; offset += pageSize) {
    // Deterministic ordering covers every page, including legacy root-path rows.
    const escaped = path.replace(/[_%]/g, '\\$&');
    const { data, error } = await client.from('nexus_documents').select('doc_id,collection_path')
      .eq('collection_name', collection).or(`collection_path.eq.${path},collection_path.like.${escaped}/%`)
      .order('doc_id', { ascending: true }).order('collection_path', { ascending: true }).range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = data || [];
    if (rows.length) await visit(rows.map(row => row.doc_id));
    if (rows.length < pageSize) break;
  }
}

async function runRetentionSweep({ maxWorkspaces = 25, pages = visitCollectionPages, purge = purgeWorkspaceRetention, legacy = purgeLegacyWorkspaceActivity } = {}) {
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(maxWorkspaces) || 25)));
  let removed = 0, workspaces = 0;
  const seen = new Set();
  await pages('workspaces', 'workspaces', pageSize, async ids => {
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id); removed += await purge(id); workspaces += 1;
    }
  });
  removed += await legacy(365);
  return { workspaces, removed };
}

function startRetentionWorker() {
  if (String(process.env.RETENTION_WORKER_ENABLED || 'true').toLowerCase() === 'false') return null;
  const intervalMs = Math.min(Math.max(Number(process.env.RETENTION_SWEEP_INTERVAL_MS) || 60 * 60 * 1000, 15 * 60 * 1000), 24 * 60 * 60 * 1000);
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { const result = await runRetentionSweep(); console.log(`🧹 Retention sweep: ${result.removed} records removed across ${result.workspaces} workspaces.`); }
    catch (error) { console.warn('Retention sweep failed:', error.message); }
    finally { running = false; }
  };
  run();
  return setInterval(run, intervalMs);
}

module.exports = { runRetentionSweep, startRetentionWorker, purgeWorkspaceRetention, visitCollectionPages };
