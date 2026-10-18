const { adminDb } = require('./supabaseAdmin');

function safeLimit(value, fallback = 100, max = 250) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

function toMillis(value) {
  if (value == null) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function normalizeEvent(source, id, data = {}) {
  return {
    id: `${source}_${id}`,
    source,
    type: data.type || data.action || 'event',
    message: data.message || data.description || data.type || data.action || 'Event',
    actor: data.actor || data.actorUid || data.createdBy || data.uid || (source === 'api' ? 'API client' : 'Not recorded'),
    severity: data.severity || (source === 'security' ? 'medium' : 'low'),
    requestId: data.requestId || null,
    apiKeyId: data.apiKeyId || null,
    environment: data.environment || null,
    statusCode: data.statusCode ?? null,
    latencyMs: data.latencyMs ?? null,
    createdAt: Number.isFinite(new Date(data.createdAt || data.timestamp || data.ts).getTime()) && (data.createdAt || data.timestamp || data.ts) ? new Date(data.createdAt || data.timestamp || data.ts).toISOString() : null,
  };
}

async function listAuditEvents(workspaceId, { limit = 100, source = 'all' } = {}) {
  if (!['all','security','activity','api'].includes(source)) throw Object.assign(new Error('Invalid audit source.'), {status:400});
  const count = safeLimit(limit);
  const db = adminDb();
  const sources = source === 'all' ? ['activity','security','api'] : [source];
  const promises = [];

  if (sources.includes('activity')) {
    promises.push(db.collection('workspaceActivity').where('workspaceId', '==', workspaceId).orderBy('ts', 'desc').limit(count).get()
      .then((snap) => snap.docs.map((doc) => normalizeEvent('activity', doc.id, doc.data()))));
  }
  if (sources.includes('security')) {
    promises.push(db.collection('workspaces').doc(workspaceId).collection('securityEvents').orderBy('createdAt', 'desc').limit(count).get()
      .then((snap) => snap.docs.map((doc) => normalizeEvent('security', doc.id, doc.data()))));
  }
  if (sources.includes('api')) {
    promises.push(db.collection('workspaces').doc(workspaceId).collection('apiLogs').orderBy('createdAt', 'desc').limit(count).get()
      .then((snap) => snap.docs.map((doc) => normalizeEvent('api', doc.id, {
        ...doc.data(),
        type: `${doc.data()?.method || 'API'} ${doc.data()?.path || ''}`.trim(),
        message: `${doc.data()?.method || 'API'} ${doc.data()?.path || ''} → ${doc.data()?.statusCode ?? '—'}`.trim(),
        severity: Number(doc.data()?.statusCode || 0) >= 400 ? 'warning' : 'low',
      }))));
  }

  const results = await Promise.all(promises);
  return results.flat().sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt) || a.id.localeCompare(b.id)).slice(0, count);
}

function csvEscape(value) {
  const raw = value == null ? '' : String(value);
  const text = /^[\s]*[=+@-]/.test(raw) ? "'" + raw : raw;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildAuditCsv(events) {
  const rows = [
    ['event_id', 'source', 'type', 'message', 'actor', 'severity', 'request_id', 'created_at'],
    ...events.map((event) => [event.id, event.source, event.type, event.message, event.actor, event.severity, event.requestId || '', event.createdAt || '']),
  ];
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}

module.exports = { listAuditEvents, buildAuditCsv };
