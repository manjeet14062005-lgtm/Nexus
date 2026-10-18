const crypto = require('crypto');
const { adminDb } = require('./supabaseAdmin');

function logId() {
  return `log_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

function registerApiRequestLog(req, res) {
  const started = Date.now();
  res.on('finish', () => {
    const auth = req.apiAuth;
    if (!auth?.workspaceId) return;
    const path = String(req.originalUrl || req.path || '').split('?')[0].slice(0, 512);
    const record = {
      workspaceId: auth.workspaceId,
      apiKeyId: auth.keyId,
      environment: auth.environment,
      method: req.method,
      path,
      statusCode: res.statusCode,
      latencyMs: Date.now() - started,
      requestId: req.requestId || null,
      userAgent: String(req.headers['user-agent'] || '').slice(0, 256) || null,
      createdAt: new Date().toISOString(),
    };
    adminDb().collection('workspaces').doc(auth.workspaceId).collection('apiLogs').doc(logId()).set(record).catch((error) => {
      console.error('API request log write failed:', error.message);
    });
  });
}

async function listApiLogs(workspaceId, limit = 100) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const snapshot = await adminDb().collection('workspaces').doc(workspaceId).collection('apiLogs')
    .orderBy('createdAt', 'desc').limit(safeLimit).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

module.exports = { registerApiRequestLog, listApiLogs };
