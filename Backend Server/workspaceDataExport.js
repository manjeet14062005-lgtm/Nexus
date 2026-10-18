const { adminDb } = require('./supabaseAdmin');

async function getDocsByWorkspace(collectionName, workspaceId, limit = 5000) {
  const snapshot = await adminDb().collection(collectionName).where('workspaceId', '==', workspaceId).limit(limit).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function getNestedCollection(workspaceRef, name, limit = 5000) {
  const snapshot = await workspaceRef.collection(name).limit(limit).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function sanitizeApiKeys(items) {
  return items.map(({ keyHash, ...item }) => ({ ...item, secret: undefined }));
}

function sanitizeWebhooks(items) {
  return items.map(({ signingSecretCiphertext, signingSecretIv, signingSecretTag, ...item }) => item);
}

async function exportWorkspaceData(workspaceId) {
  const db = adminDb();
  const workspaceRef = db.collection('workspaces').doc(workspaceId);
  const workspaceSnap = await workspaceRef.get();
  if (!workspaceSnap.exists) throw Object.assign(new Error('Workspace not found.'), { status: 404, code: 'NOT_FOUND' });

  const [members, invites, activity, apiKeys, verificationRequests, customerUsers, usage, webhooks, webhookEvents, apiLogs, analyticsDaily, reportRuns, reportSchedules, automationWorkflows, automationJobs, securityEvents] = await Promise.all([
    getDocsByWorkspace('workspaceMembers', workspaceId),
    getDocsByWorkspace('workspaceInvites', workspaceId),
    getDocsByWorkspace('workspaceActivity', workspaceId),
    getNestedCollection(workspaceRef, 'apiKeys'),
    getNestedCollection(workspaceRef, 'verificationRequests'),
    getNestedCollection(workspaceRef, 'customerUsers'),
    getNestedCollection(workspaceRef, 'usage'),
    getNestedCollection(workspaceRef, 'webhooks'),
    getNestedCollection(workspaceRef, 'webhookEvents'),
    getNestedCollection(workspaceRef, 'apiLogs'),
    getNestedCollection(workspaceRef, 'analyticsDaily'),
    getNestedCollection(workspaceRef, 'reportRuns'),
    getNestedCollection(workspaceRef, 'reportSchedules'),
    getNestedCollection(workspaceRef, 'automationWorkflows'),
    getNestedCollection(workspaceRef, 'automationJobs'),
    getNestedCollection(workspaceRef, 'securityEvents'),
  ]);

  const webhookDeliveries = [];
  for (const webhook of webhooks) {
    const snapshot = await workspaceRef.collection('webhooks').doc(webhook.id).collection('deliveries').limit(5000).get();
    for (const doc of snapshot.docs) webhookDeliveries.push({ webhookId: webhook.id, id: doc.id, ...doc.data() });
  }

  return {
    schemaVersion: '6.0',
    exportedAt: new Date().toISOString(),
    workspace: { id: workspaceSnap.id, ...workspaceSnap.data() },
    members,
    invites,
    activity,
    apiKeys: sanitizeApiKeys(apiKeys),
    verificationRequests,
    customerUsers,
    usage,
    webhooks: sanitizeWebhooks(webhooks),
    webhookDeliveries,
    webhookEvents,
    apiLogs,
    analyticsDaily,
    reportRuns,
    reportSchedules,
    automationWorkflows,
    automationJobs,
    securityEvents,
    note: 'Secrets and write-only credentials are intentionally excluded from exports.',
  };
}

module.exports = { exportWorkspaceData };
