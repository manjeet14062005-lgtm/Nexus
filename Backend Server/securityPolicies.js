const { adminDb } = require('./supabaseAdmin');
const crypto = require('crypto');

const RETENTION_OPTIONS = Object.freeze([30, 60, 90, 180, 365]);
const DEFAULT_SECURITY_POLICY = Object.freeze({
  allowedInviteDomains: [],
  auditLogRetentionDays: 180,
  apiLogRetentionDays: 90,
  webhookDeliveryRetentionDays: 30,
});

function cleanDomains(value) {
  if (!Array.isArray(value) || value.length > 50 || value.some(item => typeof item !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(item.trim().toLowerCase().replace(/^@/, '')))) {
    throw Object.assign(new Error('Enter valid invitation domains, such as example.com. No restrictions were changed.'), { status: 400, code: 'INVALID_INVITE_DOMAINS' });
  }
  const domains = [...new Set(value.map((item) => String(item || '').trim().toLowerCase().replace(/^@/, '')))]
    .filter((domain) => domain && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain))
    .slice(0, 50);
  return domains;
}

function cleanRetention(value, fallback) {
  const days = Number(value);
  return RETENTION_OPTIONS.includes(days) ? days : fallback;
}

function normalizePolicy(data = {}) {
  return {
    allowedInviteDomains: Array.isArray(data.allowedInviteDomains) ? data.allowedInviteDomains : [],
    auditLogRetentionDays: cleanRetention(data.auditLogRetentionDays, DEFAULT_SECURITY_POLICY.auditLogRetentionDays),
    apiLogRetentionDays: cleanRetention(data.apiLogRetentionDays, DEFAULT_SECURITY_POLICY.apiLogRetentionDays),
    webhookDeliveryRetentionDays: cleanRetention(data.webhookDeliveryRetentionDays, DEFAULT_SECURITY_POLICY.webhookDeliveryRetentionDays),
    updatedAt: data.updatedAt || null,
    updatedBy: data.updatedBy || null,
  };
}

async function getSecurityPolicy(workspaceId) {
  const ref = adminDb().collection('workspaces').doc(workspaceId).collection('settings').doc('securityPolicy');
  const snap = await ref.get();
  return snap.exists ? { ...normalizePolicy(snap.data()), exists: true } : { ...DEFAULT_SECURITY_POLICY, exists: false, updatedAt: null, updatedBy: null };
}

async function updateSecurityPolicy({ workspaceId, uid, input, db = adminDb }) {
  const store = db();
  const ref = store.collection('workspaces').doc(workspaceId).collection('settings').doc('securityPolicy');
  const eventRef = store.collection('workspaces').doc(workspaceId).collection('securityEvents').doc();
  return store.runTransaction(async tx => {
  const snapshot = await tx.get(ref);
  const current = snapshot.exists ? normalizePolicy(snapshot.data()) : DEFAULT_SECURITY_POLICY;
  const next = {
    allowedInviteDomains: input.allowedInviteDomains === undefined ? current.allowedInviteDomains : cleanDomains(input.allowedInviteDomains),
    auditLogRetentionDays: input.auditLogRetentionDays === undefined ? current.auditLogRetentionDays : cleanRetention(input.auditLogRetentionDays, -1),
    apiLogRetentionDays: input.apiLogRetentionDays === undefined ? current.apiLogRetentionDays : cleanRetention(input.apiLogRetentionDays, -1),
    webhookDeliveryRetentionDays: input.webhookDeliveryRetentionDays === undefined ? current.webhookDeliveryRetentionDays : cleanRetention(input.webhookDeliveryRetentionDays, -1),
    updatedAt: new Date().toISOString(),
    updatedBy: uid,
  };
  if (!Array.isArray(next.allowedInviteDomains) || !RETENTION_OPTIONS.includes(next.auditLogRetentionDays) || !RETENTION_OPTIONS.includes(next.apiLogRetentionDays) || !RETENTION_OPTIONS.includes(next.webhookDeliveryRetentionDays)) {
    throw Object.assign(new Error('Choose a supported retention period.'), { status: 400, code: 'INVALID_RETENTION' });
  }
  tx.set(ref, next, { merge: true });
  tx.set(eventRef, { type: 'security_policy.updated', message: 'Workspace security policy updated.', severity: 'low', actorUid: uid, policyDigest: createPolicyDigest(next), createdAt: next.updatedAt });
  return normalizePolicy(next);
  });
}

function getEmailDomain(email) {
  const value = String(email || '').trim().toLowerCase();
  const at = value.lastIndexOf('@');
  return at >= 0 ? value.slice(at + 1) : '';
}

function isInviteDomainAllowed(email, policy) {
  const domains = Array.isArray(policy?.allowedInviteDomains) ? policy.allowedInviteDomains : [];
  if (!domains.length) return true;
  return domains.includes(getEmailDomain(email));
}

function retentionCutoffIso(days) {
  return new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString();
}

function createPolicyDigest(policy) {
  return crypto.createHash('sha256').update(JSON.stringify(policy)).digest('hex').slice(0, 16);
}

module.exports = {
  RETENTION_OPTIONS,
  DEFAULT_SECURITY_POLICY,
  getSecurityPolicy,
  updateSecurityPolicy,
  getEmailDomain,
  isInviteDomainAllowed,
  retentionCutoffIso,
  createPolicyDigest,
  cleanDomains,
};
